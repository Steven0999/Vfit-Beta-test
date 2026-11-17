package com.vaughanfitness.vfit.calendarverification;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Bundle;
import android.provider.CalendarContract;
import android.provider.CalendarContract.Calendars;
import android.provider.CalendarContract.Events;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;

public final class CalendarSeed extends Instrumentation {
    private static final String ACCOUNT = "VFIT test calendar";

    @Override public void onCreate(Bundle arguments) {
        super.onCreate(arguments);
        start();
    }

    @Override public void onStart() {
        Bundle outcome = new Bundle();
        try {
            ContentResolver resolver = getTargetContext().getContentResolver();
            ZoneId zone = ZoneId.systemDefault();
            LocalDate today = LocalDate.now(zone);
            long calendarId = createCalendar(resolver, zone);

            ContentValues nights = event(calendarId, "Night shift", today.plusDays(1).atTime(20, 0).atZone(zone).toInstant().toEpochMilli(), zone);
            nights.put(Events.DURATION, "PT12H");
            nights.put(Events.RRULE, "FREQ=DAILY;COUNT=3");
            insert(resolver, Events.CONTENT_URI, nights);

            ContentValues other = event(calendarId, "Dentist", today.plusDays(4).atTime(10, 0).atZone(zone).toInstant().toEpochMilli(), zone);
            other.put(Events.DTEND, other.getAsLong(Events.DTSTART) + 3_600_000L);
            insert(resolver, Events.CONTENT_URI, other);

            ContentValues allDay = event(calendarId, "Day shift", today.plusDays(5).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(), ZoneOffset.UTC);
            allDay.put(Events.ALL_DAY, 1);
            allDay.put(Events.EVENT_TIMEZONE, "UTC");
            allDay.put(Events.DTEND, allDay.getAsLong(Events.DTSTART) + 86_400_000L);
            insert(resolver, Events.CONTENT_URI, allDay);
            outcome.putString("stream", "Created recurring shifts and a non-work event.\n");
            finish(Activity.RESULT_OK, outcome);
        } catch (RuntimeException error) {
            outcome.putString("stream", "Calendar fixture could not be created: " + error + "\n");
            finish(Activity.RESULT_CANCELED, outcome);
        }
    }

    private static long createCalendar(ContentResolver resolver, ZoneId zone) {
        String accountType = CalendarContract.ACCOUNT_TYPE_LOCAL;
        Uri uri = Calendars.CONTENT_URI.buildUpon()
            .appendQueryParameter(CalendarContract.CALLER_IS_SYNCADAPTER, "true")
            .appendQueryParameter(Calendars.ACCOUNT_NAME, ACCOUNT)
            .appendQueryParameter(Calendars.ACCOUNT_TYPE, accountType)
            .build();
        ContentValues calendar = new ContentValues();
        calendar.put(Calendars.ACCOUNT_NAME, ACCOUNT);
        calendar.put(Calendars.ACCOUNT_TYPE, accountType);
        calendar.put(Calendars.NAME, ACCOUNT);
        calendar.put(Calendars.CALENDAR_DISPLAY_NAME, ACCOUNT);
        calendar.put(Calendars.CALENDAR_COLOR, 0xfff97316);
        calendar.put(Calendars.OWNER_ACCOUNT, ACCOUNT);
        calendar.put(Calendars.CALENDAR_ACCESS_LEVEL, Calendars.CAL_ACCESS_OWNER);
        calendar.put(Calendars.CALENDAR_TIME_ZONE, zone.getId());
        calendar.put(Calendars.VISIBLE, 1);
        calendar.put(Calendars.SYNC_EVENTS, 1);
        return ContentUris.parseId(insert(resolver, uri, calendar));
    }

    private static ContentValues event(long calendar, String title, long start, ZoneId zone) {
        ContentValues event = new ContentValues();
        event.put(Events.CALENDAR_ID, calendar);
        event.put(Events.TITLE, title);
        event.put(Events.DTSTART, start);
        event.put(Events.EVENT_TIMEZONE, zone.getId());
        return event;
    }

    private static Uri insert(ContentResolver resolver, Uri uri, ContentValues values) {
        Uri inserted = resolver.insert(uri, values);
        if (inserted == null) throw new IllegalStateException("Android Calendar Provider refused a fixture record");
        return inserted;
    }
}
