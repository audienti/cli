import {randomUUID} from 'node:crypto';
import {HostedResponseUnknown} from './workspaces.mjs';
// #257: find N prospects for a Campaign. Searches LinkedIn with the Audience filters, then asks the server
// to check each new person. The server fetches, runs the rules and records the result; this file only
// drives the loop and adds up the spend. Amounts are pico USD (1 credit = 10,000,000,000).
export const PICO_PER_CREDIT=10_000_000_000n;
// Waits before each retry of a check whose outcome is unknown, in milliseconds.
const RECOVERY_WAITS=[2000,5000,15000];
const OUTCOMES=['fit','held','not_fit','already_found'];
// Only a definite answer lets the run go on. A check that is still open, a lost response or a server
// error may still be paying, so the same request ID is retried; anything else unexpected stops the run.
const pending=error=>error instanceof HostedResponseUnknown||error?.code==='check_running'||error?.status>=500&&!['tool_unavailable','history_policy_unavailable'].includes(error?.code);
// A refusal about this one person (a bad URL, no LinkedIn profile) is final, and the run moves on.
const skippable=error=>[400,404,422].includes(error?.status);
const MAX_SEARCHES=12,MAX_PAGES=10;
const positive=list=>(list??[]).filter(item=>!item.negative);
const numeric=value=>typeof value==='string'&&/^\d{1,20}$/.test(value);
// A charge the server reported for one request. Charges are cumulative per request ID, so the largest one
// seen across attempts is the request's charge so far.
const reportedCharge=value=>numeric(value)?BigInt(value):0n;

/** One profiles.search input per title, location and keyword combination the Audience and Campaign name. */
export function planSearches(audience,signals=[]){
 const titles=positive(audience.person?.currentTitles).map(item=>item.name).filter(Boolean).slice(0,5);
 // #281: the people search has no company region filter, so with no person location the company's region is
 // searched as where the person is. Without it the search pays to check people anywhere in the world.
 const places=positive(audience.person?.locations).length?positive(audience.person?.locations):positive(audience.company?.locations);
 const locations=places.slice(0,3).map(item=>numeric(item.providerId)?{geoId:item.providerId}:{location:item.name});
 // #322: the search takes 20 industry ids at a time, so a longer list is split across searches, never cut.
 const industryIds=[...new Set(positive(audience.company?.industries).map(item=>item.providerId).filter(numeric))];
 const industryChunks=[];for(let i=0;i<industryIds.length;i+=20)industryChunks.push(industryIds.slice(i,i+20));
 // A topic signal is a keyword people use; research and profile signals are judged after the fetch, not searched.
 const queries=[...new Set([audience.discoveryKeyword,...signals.filter(signal=>signal.kind==='topic').map(signal=>signal.topic)].map(value=>value?.trim()).filter(Boolean))].slice(0,3);
 // At most MAX_SEARCHES title, place and keyword combinations. Each one is searched across every industry chunk, so
 // a long industry list never pushes a title out of the plan. The credit cap still bounds what the searches cost.
 const combos=[];
 for(const title of titles.length?titles:[undefined])for(const place of locations.length?locations:[{}])for(const query of queries.length?queries:[undefined])combos.push({kind:'person',...(title?{title}:{}),...place,...(query?{query}:{})});
 const searches=[];
 for(const combo of combos.slice(0,MAX_SEARCHES))for(const ids of industryChunks.length?industryChunks:[undefined]){
  const input={...combo,...(ids?{industryIds:ids}:{})};
  if(input.title||input.query||input.geoId||input.location||input.industryIds)searches.push(input);
 }
 return searches;
}

export function parseCredits(value){
 if(typeof value!=='string'||!/^\d{1,7}(\.\d{1,4})?$/.test(value))throw new Error('Set --max-credits to a number of credits, like 50 or 12.5.');
 const [whole,fraction='']=value.split('.');
 return BigInt(whole)*PICO_PER_CREDIT+BigInt(fraction.padEnd(4,'0'))*(PICO_PER_CREDIT/10_000n);
}
export const credits=pico=>{const whole=pico/PICO_PER_CREDIT,rest=(pico%PICO_PER_CREDIT)*10_000n/PICO_PER_CREDIT;return rest?`${whole}.${rest.toString().padStart(4,'0').replace(/0+$/,'')}`:`${whole}`;};
const charged=data=>data?.billing?.status==='charged'&&/^\d+$/.test(data.billing.amount??'')?BigInt(data.billing.amount):0n;
// A search is final once its outcome is known and its charge has settled.
const searchSettled=data=>['succeeded','failed','rejected'].includes(data?.status)&&(data.billing?.status==='not_charged'||charged(data)>0n||data.billing?.status==='charged'&&data.billing.amount==='0');
const personUrl=url=>typeof url==='string'&&/^https:\/\/([a-z]{2,3}\.)?(www\.)?linkedin\.com\/in\//i.test(url);

async function settled(call,workspaceId,data,wait){
 for(let tries=0;data?.operationId&&!searchSettled(data)&&data.status!=='uncertain'&&tries<30;tries++){await wait(2000);data=(await call('tools_runs_get',{workspaceId,operationId:data.operationId})).data;}
 return data;
}

/**
 * Searches and checks until `count` new fits are found, the searches run out, or the next paid call could pass
 * `maxCredits`. A search runs only when its published price fits what is left. Each check sends what is left as
 * `maxCharge`, and the server refuses a check whose worst case (both profile fetches paid) could pass it.
 */
export async function findCampaignProspects(call,{workspaceId,campaignId,count,maxCredits},{wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),progress=()=>{}}={}){
 const {data:campaign}=await call('campaign_get',{workspaceId,campaignId});
 const fields=campaign.revision.fields;
 if(!['Draft','Preparing','Active'].includes(campaign.campaign.state))throw new Error('This campaign is not finding prospects. Pick a Draft, Preparing or Active campaign.');
 const {data:audience}=await call('audience_get',{workspaceId,audienceId:fields.audienceId,revision:fields.audienceRevision});
 // #322: the search cannot apply an older audience's industry group, so it would pay to check people in any
 // industry. Refuse before any paid call; named industries are searched.
 const company=audience.revision.fields.company;
 if(company?.industryGroups?.length&&!positive(company.industries).length)throw new Error("This campaign's audience uses an older industry group, which the LinkedIn search cannot apply. Name the industries in the audience instead (audienti audience options --kind industries --q TEXT), then try again.");
 const searches=planSearches(audience.revision.fields,fields.signals);
 // #323: rules that will reject people (a named title below the seniority floor) are shown before the first paid call.
 const warnings=audience.revision.warnings??[];
 for(const warning of warnings)progress({warning});
 if(!searches.length)throw new Error("This campaign's audience has no title, location, industry or keyword to search by. Add one, then try again.");
 const {data:tool}=await call('tools_get',{workspaceId,tool:'profiles.search'});
 if(!/^\d{1,20}$/.test(tool?.price?.picoUsd??''))throw new Error('The LinkedIn search has no fixed price right now, so the credit cap cannot be kept. Try again later.');
 const searchPrice=BigInt(tool.price.picoUsd);
 const report={campaignId,state:campaign.campaign.state,target:count,maxCredits:credits(maxCredits),spentCredits:'0',spent:'0',searches:0,checked:0,fit:0,held:0,notFit:0,alreadyFound:0,failed:0,stoppedBecause:'searches_exhausted',fits:[],heldPeople:[],...(warnings.length?{audienceWarnings:warnings}:{})};
 let spent=0n;const seen=new Set();
 const finish=reason=>{report.stoppedBecause=reason;report.spent=spent.toString();report.spentCredits=credits(spent);return report;};
 // The check may have paid more than it reported; the rest is recovered with the same request ID.
 const unknown=(url,requestId,error)=>{report.unknownCheck={url,requestId,code:error?.code??'response_unknown'};return finish('outcome_unknown');};
 for(const input of searches){
  for(let page=1;page&&page<=MAX_PAGES;){
   if(report.fit>=count)return finish('count_reached');
   if(spent+searchPrice>maxCredits)return finish('credit_cap');
   // Search results are not saved as People; only a person the check fetches joins People.
   // Nothing else pays until this search has settled: a search still running, uncertain or with a charge not
   // yet final is retried with the same request ID, and if it never settles the run stops and names it.
   const search={workspaceId,requestId:randomUUID(),input:{...input,...(page>1?{page}:{}),saveProfiles:false}};
   let data=null,failure=null,paid=0n;
   for(let attempt=0;;attempt++){
    try{data=await settled(call,workspaceId,(await call('tools_profiles_search',search)).data,wait);failure=null;}
    catch(error){if(!pending(error))throw error;failure=error;}
    if(!failure&&charged(data)>paid)paid=charged(data);
    if(!failure&&searchSettled(data))break;
    if(attempt>=RECOVERY_WAITS.length){
     spent+=paid;report.searches++;
     report.unknownSearch={requestId:search.requestId,operationId:data?.operationId??null,code:failure?.code??data?.error?.code??data?.status??'response_unknown'};
     return finish('outcome_unknown');
    }
    await wait(RECOVERY_WAITS[attempt]);
   }
   spent+=paid;report.searches++;
   if(data?.status!=='succeeded'){if(data?.error?.code==='insufficient_credits')return finish('no_credits');break;}
   const items=(data.result?.items??[]).filter(item=>personUrl(item.url)&&!seen.has(item.url));
   for(const item of items){
    seen.add(item.url);
    if(report.fit>=count)return finish('count_reached');
    if(spent>=maxCredits)return finish('credit_cap');
    // Nothing else pays until this check has a definite answer. The same request ID replays the stored
    // outcome and charge; if no definite answer comes, the run stops and names the check to recover.
    const args={workspaceId,campaignId,url:item.url,requestId:randomUUID(),maxCharge:(maxCredits-spent).toString()};
    // Every attempt's reported charge is kept, and the largest is counted once on every way out.
    let result,failure,paid=0n;
    for(let attempt=0;;attempt++){
     try{result=(await call('campaign_prospect_check',args)).data;failure=null;}
     catch(error){result=null;failure=error;}
     const reported=reportedCharge(failure?failure.charged:result?.charged);
     if(reported>paid)paid=reported;
     if(!failure&&!OUTCOMES.includes(result?.outcome)){failure={code:'invalid_response'};break;}
     if(!failure||!pending(failure)||attempt>=RECOVERY_WAITS.length)break;
     await wait(RECOVERY_WAITS[attempt]);
    }
    spent+=paid;
    if(failure){
     const error=failure;
     if(pending(error)||error.code==='invalid_response')return unknown(item.url,args.requestId,error);
     if(error.code==='check_over_budget')return finish('credit_cap');
     if(error.status===402)return finish('no_credits');
     if(error.code==='campaign_not_active')return finish('campaign_not_active');
     if(['tool_unavailable','history_policy_unavailable'].includes(error.code))return finish('tool_unavailable');
     if(!skippable(error))return unknown(item.url,args.requestId,error);
     report.failed++;progress({url:item.url,outcome:'failed',code:error.code,spent:credits(spent)});continue;
    }
    report.checked++;
    const who={prospectId:result.prospectId,url:item.url,name:item.name??null,reason:result.assessment?.fit?.reason??null};
    if(result.outcome==='fit'){report.fit++;report.fits.push({...who,admission:result.assessment?.admission});}
    else if(result.outcome==='held'){report.held++;report.heldPeople.push({...who,reason:result.assessment?.reason??null});}
    else if(result.outcome==='not_fit')report.notFit++;
    else report.alreadyFound++;
    progress({url:item.url,outcome:result.outcome,spent:credits(spent)});
   }
   // Follow the next page even when this one had only people already seen; MAX_PAGES still bounds it.
   page=data.result?.nextPage>page?data.result.nextPage:0;
  }
 }
 return finish(report.fit>=count?'count_reached':'searches_exhausted');
}
