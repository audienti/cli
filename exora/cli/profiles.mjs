import { parseArgs } from 'node:util';
import { callWorkspace, configuration } from './workspaces.mjs';

export async function profilesCli(argv) {
  const {positionals,values}=parseArgs({args:argv.slice(1),allowPositionals:true,strict:true,options:{help:{type:'boolean',short:'h'},json:{type:'boolean'},profile:{type:'string'},workspace:{type:'string'},'prospect-id':{type:'string'},kind:{type:'string'},provider:{type:'string'},search:{type:'string'},cursor:{type:'string'},limit:{type:'string'},'request-id':{type:'string'},'evaluation-digest':{type:'string'}}});
  if(values.help||!positionals.length) {
    console.log('Usage: audienti profiles match evaluate SOURCE_ID CANDIDATE_ID | match apply SOURCE_ID CANDIDATE_ID --evaluation-digest HASH --request-id UUID | history RESOLUTION_ID | list|search [--search TEXT] [--prospect-id ID] [--provider NAME] [--kind person|company] [--cursor CURSOR] [--limit 1..100] | get ID [--workspace ID] [--profile PATH] [--json]\nSaved workspace Profile reads only. For paid external discovery use tools profiles.discover; for explicit enrichment use tools profiles.enrich.'); return;
  }
  let name, input={workspaceId:values.workspace};
  if(positionals[0]==='match'&&positionals.length===4&&['evaluate','apply'].includes(positionals[1])) {
    if(['prospect-id','kind','provider','search','cursor','limit'].some(key=>values[key]!==undefined)) throw new Error('Profile matching accepts two IDs, workspace and credential profile only, plus apply digest/request ID.');
    name=positionals[1]==='evaluate'?'profile_match_evaluate':'profile_match_apply'; input.sourceProfileId=positionals[2]; input.candidateProfileId=positionals[3];
    if(positionals[1]==='apply') { input.requestId=values['request-id']; input.evaluationDigest=values['evaluation-digest']; }
    else if(values['request-id']!==undefined||values['evaluation-digest']!==undefined) throw new Error('Evaluate does not accept apply review fields.');
  } else if(positionals[0]==='history'&&positionals.length===2) {
    if(['prospect-id','kind','provider','search','cursor','limit','request-id','evaluation-digest'].some(key=>values[key]!==undefined)) throw new Error('Identity history accepts a resolution ID, workspace and credential profile only.');
    name='profile_identity_history'; input.resolutionId=positionals[1];
  } else if(['list','search'].includes(positionals[0])&&positionals.length===1) {
    name='profile_list';
    for(const key of ['kind','provider','search','cursor']) if(values[key]!==undefined) input[key]=values[key];
    if(values['prospect-id']!==undefined) input.prospectId=values['prospect-id'];
    if(values.limit!==undefined) input.limit=Number(values.limit);
  } else if(positionals[0]==='get'&&positionals.length===2) {
    if(['prospect-id','kind','provider','search','cursor','limit'].some(key=>values[key]!==undefined)) throw new Error('Profile get accepts an ID, workspace and credential profile only.');
    name='profile_get'; input.profileId=positionals[1];
  } else throw new Error('Use profiles list/search or profiles get ID.');
  if(!positionals.includes('match')&&(values['request-id']!==undefined||values['evaluation-digest']!==undefined)) throw new Error('Apply review fields require profiles match apply.');
  console.log(JSON.stringify(await callWorkspace(name,input,configuration(values.profile))));
}
