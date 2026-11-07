import {callWorkspace,configuration} from './workspaces.mjs';
const askHelp='Use ask "QUESTION" [--context TEXT] [--option TEXT]... [--campaign ID] [--task ID] [--topic KEY]. Pass --campaign ID --topic campaign:ID for a campaign decision (first_campaign only before it exists). The server derives the campaign topic when omitted; superseded lists the replaced question IDs.';
const help='Use questions [list] [--state open|answered|withdrawn|superseded|all] | show ID | withdraw ID | answer ID --answer TEXT.';
function parse(args,allowed,usage){
 const position=[],flags={},options=[];
 for(let i=1;i<args.length;i++){
  if(!args[i].startsWith('--')){position.push(args[i]);continue}
  const key=args[i].slice(2);if(key==='json')continue;
  if(!allowed.includes(key)||args[i+1]===undefined||args[i+1].startsWith('--'))throw new Error(`Unknown or incomplete option. ${usage}`);
  if(key==='option'){options.push(args[++i]);continue}
  if(Object.hasOwn(flags,key))throw new Error(`Repeated option --${key}. ${usage}`);
  flags[key]=args[++i];
 }
 return {position,flags,options};
}
export async function askCli(args){
 const {position,flags,options}=parse(args,['profile','workspace','context','option','campaign','task','topic'],askHelp);
 if(position.length!==1||!position[0].trim())throw new Error(askHelp);
 const input={workspaceId:flags.workspace,question:position[0],...(flags.context?{context:flags.context}:{}),...(options.length?{options}:{}),...(flags.campaign?{campaignId:flags.campaign}:{}),...(flags.topic?{topic:flags.topic}:{}),...(flags.task?{taskId:flags.task}:{})};
 console.log(JSON.stringify((await callWorkspace('agent_question_ask',input,configuration(flags.profile))).data));
}
export async function questionsCli(args){
 const {position,flags}=parse(args,['profile','workspace','state','limit','answer'],help);
 const command=position[0]??'list',id=position[1],config=configuration(flags.profile),workspaceId=flags.workspace;
 const call=async(name,input)=>(await callWorkspace(name,{workspaceId,...input},config)).data;
 if(command==='list'){if(position.length>1)throw new Error(help);console.log(JSON.stringify(await call('agent_question_list',{...(flags.state?{state:flags.state}:{}),...(flags.limit?{limit:Number(flags.limit)}:{})})));return}
 if(!id||position.length!==2)throw new Error(help);
 if(command==='show'){console.log(JSON.stringify(await call('agent_question_get',{questionId:id})));return}
 if(command==='withdraw'){console.log(JSON.stringify(await call('agent_question_withdraw',{questionId:id})));return}
 if(command==='answer'){if(!flags.answer)throw new Error('Give the answer: --answer TEXT.');console.log(JSON.stringify(await call('agent_question_answer',{questionId:id,answer:flags.answer})));return}
 throw new Error(help);
}
