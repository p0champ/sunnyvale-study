import test from 'node:test';
import assert from 'node:assert/strict';
import {formatReference,flickVelocity,englishVoice} from '../study-utils.js';
test('all citation styles omit punctuation belonging to missing fields, for every source type',()=>{
 for(const style of ['Harvard','APA','MLA','Chicago'])for(const kind of ['book','article','chapter','film','web']){
  for(const extras of [{},{year:'1986'},{authors:['Example, A.'],publisher:'Publisher',place:'City',studio:'Studio',volume:'4',issue:'2',pages:'3–8'}]){
   const result=formatReference({title:'Test title',kind,...extras},style);
   assert.ok(result.includes('Test title'),style+' '+kind);
   assert.doesNotMatch(result,/[.,:]\s+[.,:]|\bundefined\b|\bnull\b|Directed by\s*[.,]|Available at:\s*[.)]|\.\s*\./,style+' '+kind+': '+result);
  }
 }
 assert.equal(formatReference({kind:'film',title:'Test Film',year:'1986'},'Harvard'),'Test Film (1986). [Film].');
 assert.ok(formatReference({kind:'article',title:'Test',doi:'https://doi.org/10.1234/example'},'APA').endsWith('https://doi.org/10.1234/example'));
});
test('light flick stashes, slow placement, noisy tracking and stale samples do not',()=>{
 const samples=xs=>xs.map((x,i)=>({t:i*20,p:[x,0,0]}));
 assert.ok(flickVelocity(samples([0,.018,.036,.054,.072,.09]),100));
 assert.equal(flickVelocity(samples([0,.003,.006,.009,.012,.015]),100),null);
 assert.equal(flickVelocity(samples([0,.001,-.001,.001,-.001,0]),100),null);
 assert.equal(flickVelocity(samples([0,0,0,0,0,.1]),100),null);
 assert.equal(flickVelocity(samples([0,.018,.036,.054,.072,.09]),300),null);
});
test('English voice selection never silently picks a German voice',()=>{
 assert.equal(englishVoice([{lang:'de-DE'},{lang:'en-GB'}],'en-US').lang,'en-GB');
 assert.equal(englishVoice([{lang:'de-DE'}],'en-US'),null);
});
