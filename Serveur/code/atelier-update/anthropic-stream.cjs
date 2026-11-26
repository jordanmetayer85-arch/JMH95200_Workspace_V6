'use strict';
// The NAS provider's SSE can stop before message_stop. Build the SDK stream from
// a complete response so a Windows action is never replayed because of a retry.
function messageEvents(message){
 if(!message||message.type!=='message'||message.role!=='assistant'||typeof message.id!=='string'||typeof message.model!=='string'||!Array.isArray(message.content)||message.content.length>100||typeof message.stop_reason!=='string'||!message.stop_reason)throw Error('Le NAS a renvoyé une réponse de pilotage incomplète.');
 const events=[{type:'message_start',message:{...message,content:[],stop_reason:null,stop_sequence:null,usage:{...message.usage,output_tokens:0}}}];
 message.content.forEach((block,index)=>{
  if(block.type==='text'&&typeof block.text==='string'){
   events.push({type:'content_block_start',index,content_block:{type:'text',text:''}});
   events.push({type:'content_block_delta',index,delta:{type:'text_delta',text:block.text}});
  }else if(block.type==='tool_use'&&typeof block.id==='string'&&typeof block.name==='string'&&block.input&&typeof block.input==='object'&&!Array.isArray(block.input)){
   events.push({type:'content_block_start',index,content_block:{type:'tool_use',id:block.id,name:block.name,input:{}}});
   events.push({type:'content_block_delta',index,delta:{type:'input_json_delta',partial_json:JSON.stringify(block.input)}});
  }else if(block.type==='thinking'&&typeof block.thinking==='string'){
   events.push({type:'content_block_start',index,content_block:{type:'thinking',thinking:''}});
   events.push({type:'content_block_delta',index,delta:{type:'thinking_delta',thinking:block.thinking}});
   if(typeof block.signature==='string')events.push({type:'content_block_delta',index,delta:{type:'signature_delta',signature:block.signature}});
  }else if(block.type==='redacted_thinking'&&typeof block.data==='string'){
   events.push({type:'content_block_start',index,content_block:block});
  }else throw Error('Le NAS a renvoyé un bloc de pilotage non pris en charge.');
  events.push({type:'content_block_stop',index});
 });
 events.push({type:'message_delta',delta:{stop_reason:message.stop_reason,stop_sequence:message.stop_sequence??null},usage:{output_tokens:Number(message.usage?.output_tokens)||0}});
 events.push({type:'message_stop'});
 return events.map(event=>'event: '+event.type+'\ndata: '+JSON.stringify(event)+'\n\n').join('');
}
async function readJson(response,max=20*1024*1024){let size=0;const chunks=[];for await(const chunk of response){size+=chunk.length;if(size>max){response.destroy();throw Error('La réponse du NAS est trop volumineuse.');}chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('Le NAS a renvoyé une réponse illisible.');}}
module.exports={messageEvents,readJson};
