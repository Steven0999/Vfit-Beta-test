'use strict';

const PHOTO_LIMIT_BYTES = 1024 * 1024;

function validatePhotoDataUrl(value) {
  if (typeof value !== 'string' || value.length > Math.ceil(PHOTO_LIMIT_BYTES * 4 / 3) + 100) return null;
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return null;
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > PHOTO_LIMIT_BYTES || bytes.toString('base64') !== match[2]) return null;
  const kind = match[1];
  const jpeg = bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  const webp = bytes.length > 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  return (kind === 'jpeg' && jpeg) || (kind === 'png' && png) || (kind === 'webp' && webp) ? value : null;
}

const FOOD_ESTIMATE_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    canEstimate: { type: 'boolean' },
    foodName: { type: 'string' },
    calories: { type: 'integer' },
    proteinGrams: { type: 'integer' },
    portionDescription: { type: 'string' },
    uncertainty: { type: 'string' }
  },
  required: ['canEstimate', 'foodName', 'calories', 'proteinGrams', 'portionDescription', 'uncertainty']
};

function extractFoodEstimate(response) {
  if (!response || response.status !== 'completed') return null;
  const message = (response.output || []).find(item => item.type === 'message');
  const output = (message && message.content || []).find(item => item.type === 'output_text');
  if (!output || typeof output.text !== 'string') return null;
  let estimate;
  try { estimate = JSON.parse(output.text); } catch (error) { return null; }
  if (estimate.canEstimate !== true || typeof estimate.foodName !== 'string'
    || typeof estimate.portionDescription !== 'string' || typeof estimate.uncertainty !== 'string') return null;
  if (!Number.isInteger(estimate.calories) || estimate.calories < 0 || estimate.calories > 5000
    || !Number.isInteger(estimate.proteinGrams) || estimate.proteinGrams < 0 || estimate.proteinGrams > 400) return null;
  const clean = value => value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  const foodName = clean(estimate.foodName).slice(0, 160);
  if (!foodName) return null;
  return {
    foodName, calories: estimate.calories, proteinGrams: estimate.proteinGrams,
    portionDescription: clean(estimate.portionDescription).slice(0, 160),
    uncertainty: clean(estimate.uncertainty).slice(0, 300)
  };
}

module.exports = { validatePhotoDataUrl, extractFoodEstimate, FOOD_ESTIMATE_SCHEMA };
