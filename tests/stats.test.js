import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { summarize, filterRides, records, monthlyDistances, escapeHtml, duration } from '../src/stats.js';

const sample = [
  {id:'a',date:'2025-01-01',title:'Озеро',bike:'Road',distanceKm:20,movingSeconds:3600,elevationM:100,avgSpeed:20},
  {id:'b',date:'2026-01-01',title:'Лес',bike:'MTB',distanceKm:90,movingSeconds:7200,elevationM:500,avgSpeed:45},
  {id:'c',date:'2026-02-01',title:'Тест',bike:'',distanceKm:1,movingSeconds:60,elevationM:0,avgSpeed:60},
];
test('aggregate speed is weighted by time, and empty selections are safe',()=>{
  assert.equal(summarize(sample).speed,111/(10860/3600));
  assert.equal(summarize([]).speed,0);
  assert.equal(summarize(sample).elevation,600);
});
test('year and case-insensitive text filters combine',()=>{
  assert.deepEqual(filterRides(sample,'2026','ЛЕС').map(r=>r.id),['b']);
  assert.deepEqual(filterRides(sample,'2025','mtb'),[]);
});
test('monthly distances include every selected year; speed record excludes short rides',()=>{
  assert.equal(monthlyDistances(sample)[0],110);
  assert.equal(monthlyDistances(sample,'2026')[0],90);
  assert.equal(records(sample).fastest.id,'b');
  assert.equal(records([]).longest,null);
});
test('untrusted ride names are escaped and duration rounding carries minutes',()=>{
  assert.equal(escapeHtml('<img src="x" onerror=alert(1)>'), '&lt;img src=&quot;x&quot; onerror=alert(1)&gt;');
  assert.equal(duration(3599),'1 ч 0 мин');
});
test('published dataset has valid unique rides, finite metrics and geographic coordinates',()=>{
  const data=JSON.parse(readFileSync(new URL('../public/data/rides.json',import.meta.url),'utf8'));
  assert.equal(data.schemaVersion,1);
  assert.ok(data.rides.length>0);
  assert.equal(new Set(data.rides.map(r=>r.id)).size,data.rides.length);
  for(const r of data.rides){
    assert.match(r.date,/^\d{4}-\d{2}-\d{2}$/);
    assert.equal(new Date(r.date).toISOString().slice(0,10),r.date);
    for(const key of ['distanceKm','movingSeconds','elapsedSeconds','elevationM']) assert.ok(Number.isFinite(r[key])&&r[key]>=0,`${r.id} ${key}`);
    assert.ok(r.elapsedSeconds>=r.movingSeconds);
    for(const segment of r.route) for(const [lat,lon] of segment) assert.ok(Math.abs(lat)<=90&&Math.abs(lon)<=180);
  }
});
