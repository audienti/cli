import { z } from 'zod';
const text=(min,max)=>z.string().meta({minLength:min,maxLength:max});
const schedule=z.object({timezone:text(1,128).describe('Trimmed IANA timezone; exact spelling retained. Starter America/New_York.'),windows:z.array(z.object({day:z.number().int().min(1).max(7),start:text(5,5),end:text(5,5)}).strict()).max(14)}).strict().describe('ISO weekday 1–7, HH:mm, start inclusive/end exclusive. End may be 24:00. No overlaps. Empty windows pause ordinary prospecting.');
const limits=z.object({dailyTarget:z.number().int().min(0).max(100000),hourlyLimit:z.number().int().min(0).max(10000),dailyLimit:z.number().int().min(0).max(100000),weeklyLimit:z.number().int().min(0).max(700000)}).strict().describe('hourly <= daily <= weekly; target <= daily. Zero pauses activity for that limit. Replies exempt.');
const account={provider:z.enum(['email','linkedin']),accountRef:text(1,200).regex(/^[A-Za-z0-9@._:+\/-]+$/)};
const write={expectedVersion:z.number().int().min(0).max(2147483646),requestId:z.string().uuid(),reason:text(1,2000).describe('Trim/NFC, no interior control characters. Attributed explanation; not sending authority.')};
const page={cursor:text(1,1024).optional(),limit:z.number().int().min(1).max(100).optional()};
const query=a=>{const q=new URLSearchParams(Object.entries(a).map(([k,v])=>[k,String(v)]));return q.size?'?'+q:'';};
export const prospectingSettingsOperations={
 prospecting_settings_get:{schema:z.object({}).strict(),method:'GET',path:()=>'/prospecting-policy'},
 prospecting_settings_set:{schema:z.object({...write,schedule,emailLimits:limits,linkedinLimits:limits}).strict(),method:'POST',path:()=>'/prospecting-policy',ownerOnly:true},
 prospecting_account_settings_get:{schema:z.object(account).strict(),method:'GET',path:a=>'/prospecting-policy/account'+query(a)},
 prospecting_account_settings_set:{schema:z.object({...write,...account,schedule:schedule.nullable(),limits:limits.nullable()}).strict(),method:'POST',path:()=>'/prospecting-policy/account',ownerOnly:true},
 prospecting_settings_history:{schema:z.object(page).strict(),method:'GET',path:a=>'/prospecting-policy/events'+query(a),ownerOnly:true},
 prospecting_accounts_list:{schema:z.object(page).strict(),method:'GET',path:a=>'/prospecting-policy/accounts'+query(a)},
};
