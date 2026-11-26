(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.JMHNavigationModel=api;})(typeof window==='undefined'?globalThis:window,()=>{
 'use strict';
 const clone=value=>JSON.parse(JSON.stringify(value));
 function identity(route){return JSON.stringify([route.page,route.path||'',route.view||null]);}
 class NavigationHistory{
  constructor(limit=120){this.limit=limit;this.reset();}
  reset(){this.entries=[];this.index=-1;this.sequence=0;}
  get current(){return this.entries[this.index]||null;}
  get canBack(){return this.index>0;}
  get canForward(){return this.index>=0&&this.index<this.entries.length-1;}
  update(route){if(this.current)this.entries[this.index]={...clone(route),id:this.current.id};}
  push(route){if(this.current&&identity(this.current)===identity(route)){this.update(route);return false;}this.entries.splice(this.index+1);this.entries.push({...clone(route),id:++this.sequence});if(this.entries.length>this.limit)this.entries.shift();this.index=this.entries.length-1;return true;}
  at(delta){return this.entries[this.index+delta]||null;}
  select(id){const i=this.entries.findIndex(route=>route.id===id);if(i<0)return null;this.index=i;return clone(this.current);}
 }
 return{NavigationHistory,identity};
});
