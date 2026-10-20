const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const port = 31000 + Math.floor(Math.random()*1000);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(),'tripsync-test-'));
const server = spawn(process.execPath,['server.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,PORT:String(port),DATA_DIR:dataDir},stdio:'ignore'});
const base = `http://127.0.0.1:${port}`;
async function waitReady(){for(let i=0;i<40;i++){try{const r=await fetch(base+'/api/health');if(r.ok)return await r.json()}catch{}await new Promise(r=>setTimeout(r,150))}throw new Error('Server did not start')}
async function call(path,method='GET',payload){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:payload===undefined?undefined:JSON.stringify(payload)});return {status:r.status,data:await r.json()}}
(async()=>{try{
 const h=await waitReady();assert.equal(h.ok,true);
 const payload={name:'Automated test trip',destination:{name:'Test City',lat:13.08,lon:80.27},settings:{days:'2'},places:[],preferences:[],members:[]};
 const created=await call('/api/trips','POST',payload);assert.equal(created.status,201);const id=created.data.id;
 assert.equal((await call('/api/trips/'+id)).status,200);
 assert.equal((await call('/api/trips/'+id,'PUT',{...payload,name:'Updated'})).status,200);
 assert.equal((await call('/api/trips/'+id+'/votes','POST',{place:'Test Beach',voter:'Tester'})).status,200);
 const loaded=await call('/api/trips/'+id);assert.equal(loaded.data.votes[0].count,1);
 assert.equal((await call('/api/trips/NOTREAL')).status,404);
 console.log('TripSync smoke tests passed: health, create/read/update shared trip, voting, unknown-code error.');
 }catch(e){console.error(e);process.exitCode=1}finally{server.kill();fs.rmSync(dataDir,{recursive:true,force:true})}})();
