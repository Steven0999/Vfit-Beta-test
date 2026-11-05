'use strict';

// Transactions commit after all request callbacks, with staged writes and aborts.
// Kept separate from the app so storage tests exercise the real persistence code.
module.exports = function fakeIndexedDb() {
  const databases = new Map();
  const api = {
    failNextWrite: false,
    beforeRead: null,
    beforeWrite: null,
    records(name, store) { return databases.get(name)?.stores.get(store)?.records || new Map(); },
    open(name, version) {
      const request = {};
      queueMicrotask(() => {
        const previous = databases.get(name);
        if (previous && version && version < previous.version) {
          request.error = new Error('VersionError');request.onerror?.();return;
        }
        const entry = previous || {version:0,stores:new Map()};databases.set(name,entry);
        const db = {
          get version() { return entry.version; },
          objectStoreNames:{contains:key=>entry.stores.has(key)},
          createObjectStore(key) {
            entry.stores.set(key,{records:new Map(),indexes:new Map()});
            return {createIndex(index,field){entry.stores.get(key).indexes.set(index,field);}};
          },
          close(){},
          transaction(storeName, mode) {
            const source=entry.stores.get(storeName);
            if(!source)throw new Error('NotFoundError: '+storeName);
            const working=new Map([...source.records].map(([key,value])=>[key,structuredClone(value)]));
            let pending=0,finished=false,failed=false;
            const transaction={error:null};
            const finish=()=>queueMicrotask(()=>{
              if(pending||finished)return;finished=true;
              if(failed){transaction.onerror?.();transaction.onabort?.();}
              else {if(mode==='readwrite')source.records=working;transaction.oncomplete?.();}
            });
            const operation=(callback,write=false)=>{
              const req={};pending++;
              queueMicrotask(()=>{
                try{
                  if(failed)throw transaction.error;
                  if(write&&api.failNextWrite){api.failNextWrite=false;throw new Error('QuotaExceededError');}
                  if(write&&mode!=='readwrite')throw new Error('ReadOnlyError');
                  if(!write&&api.beforeRead)api.beforeRead(name,storeName);
                  if(write&&api.beforeWrite)api.beforeWrite(name,storeName);
                  req.result=callback();req.onsuccess?.();
                }catch(error){req.error=error;transaction.error=error;failed=true;req.onerror?.();}
                pending--;finish();
              });return req;
            };
            const store={
              get:id=>operation(()=>working.has(id)?structuredClone(working.get(id)):undefined),
              put:record=>operation(()=>{working.set(record.id,structuredClone(record));return record.id;},true),
              add:record=>operation(()=>{if(working.has(record.id))throw new Error('ConstraintError');working.set(record.id,structuredClone(record));return record.id;},true),
              delete:id=>operation(()=>working.delete(id),true),
              index:index=>({getAll:value=>operation(()=>[...working.values()].filter(record=>record[source.indexes.get(index)]===value).map(record=>structuredClone(record)))})
            };
            transaction.objectStore=key=>{if(key!==storeName)throw new Error('NotFoundError');return store;};
            finish();return transaction;
          }
        };
        request.result=db;
        if(!previous||version>entry.version){entry.version=version||1;request.onupgradeneeded?.({oldVersion:previous?.version||0});}
        request.onsuccess?.();
      });return request;
    }
  };
  return api;
};
