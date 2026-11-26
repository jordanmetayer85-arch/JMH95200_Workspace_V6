(function(root,factory){const models=factory();if(typeof module==='object'&&module.exports)module.exports=models;else root.JMHGamesModel=models;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const shapes=[[[1,1,1,1]],[[1,1],[1,1]],[[0,1,0],[1,1,1]],[[0,1,1],[1,1,0]],[[1,1,0],[0,1,1]],[[1,0,0],[1,1,1]],[[0,0,1],[1,1,1]]];
 class Blocks{
  constructor(random=Math.random){this.random=random;this.reset();}
  reset(){this.board=Array.from({length:20},()=>Array(10).fill(0));this.bag=[];this.score=0;this.lines=0;this.over=false;this.next=this.take();this.spawn();}
  take(){if(!this.bag.length){this.bag=[0,1,2,3,4,5,6];for(let i=6;i>0;i--){const j=Math.floor(this.random()*(i+1));[this.bag[i],this.bag[j]]=[this.bag[j],this.bag[i]];}}return this.bag.pop();}
  spawn(){this.kind=this.next;this.next=this.take();this.shape=shapes[this.kind].map(r=>r.slice());this.x=Math.floor((10-this.shape[0].length)/2);this.y=0;if(!this.fits())this.over=true;}
  fits(shape=this.shape,x=this.x,y=this.y){return shape.every((row,dy)=>row.every((value,dx)=>!value||(x+dx>=0&&x+dx<10&&y+dy>=0&&y+dy<20&&!this.board[y+dy][x+dx])));}
  move(dx){if(this.over||!this.fits(this.shape,this.x+dx,this.y))return false;this.x+=dx;return true;}
  rotate(){if(this.over)return false;const shape=this.shape[0].map((_,i)=>this.shape.map(row=>row[i]).reverse());for(const shift of [0,-1,1,-2,2])if(this.fits(shape,this.x+shift,this.y)){this.shape=shape;this.x+=shift;return true;}return false;}
  drop(){if(this.over)return false;if(this.fits(this.shape,this.x,this.y+1)){this.y++;return true;}this.lock();return false;}
  hardDrop(){if(this.over)return;while(this.fits(this.shape,this.x,this.y+1)){this.y++;this.score+=2;}this.lock();}
  lock(){for(let dy=0;dy<this.shape.length;dy++)for(let dx=0;dx<this.shape[dy].length;dx++)if(this.shape[dy][dx])this.board[this.y+dy][this.x+dx]=this.kind+1;const remaining=this.board.filter(row=>row.some(v=>v===0)),count=20-remaining.length;this.board=[...Array.from({length:count},()=>Array(10).fill(0)),...remaining];this.score+=[0,100,300,500,800][count]*(1+Math.floor(this.lines/10));this.lines+=count;this.spawn();}
  ghost(){let y=this.y;while(this.fits(this.shape,this.x,y+1))y++;return y;}
 }
 const red=c=>c.suit===1||c.suit===2;
 class Solitaire{
  constructor(random=Math.random){this.random=random;this.reset();}
  reset(){const deck=Array.from({length:52},(_,i)=>({id:i,suit:Math.floor(i/13),rank:i%13+1,up:false}));for(let i=51;i>0;i--){const j=Math.floor(this.random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}this.columns=Array.from({length:7},(_,i)=>{const column=deck.splice(0,i+1);column[column.length-1].up=true;return column;});this.stock=deck;this.waste=[];this.foundations=[[],[],[],[]];this.history=[];this.moves=0;}
  snapshot(){return JSON.stringify({columns:this.columns,stock:this.stock,waste:this.waste,foundations:this.foundations,moves:this.moves});}
  remember(){this.history.push(this.snapshot());if(this.history.length>200)this.history.shift();this.moves++;}
  undo(){if(!this.history.length)return false;Object.assign(this,JSON.parse(this.history.pop()));return true;}
  draw(){if(!this.stock.length&&!this.waste.length)return false;this.remember();if(this.stock.length){const card=this.stock.pop();card.up=true;this.waste.push(card);}else{this.stock=this.waste.reverse();for(const c of this.stock)c.up=false;this.waste=[];}return true;}
  pile(type,index){return type==='column'?this.columns[index]:type==='foundation'?this.foundations[index]:type==='waste'?this.waste:null;}
  movable(type,index,start){const p=this.pile(type,index);if(!p||start<0||start>=p.length||!p[start].up)return null;const run=p.slice(start);if(type!=='column'&&run.length!==1)return null;for(let i=1;i<run.length;i++)if(!run[i].up||run[i-1].rank!==run[i].rank+1||red(run[i-1])===red(run[i]))return null;return run;}
  move(from,to){if(from.type===to.type&&from.index===to.index)return false;const run=this.movable(from.type,from.index,from.start),dest=this.pile(to.type,to.index);if(!run||!dest||!['column','foundation'].includes(to.type))return false;const card=run[0],top=dest[dest.length-1];if(to.type==='foundation'){if(run.length!==1||card.suit!==to.index||card.rank!==(top?top.rank+1:1))return false;}else if(top?!top.up||red(card)===red(top)||card.rank!==top.rank-1:card.rank!==13)return false;this.remember();const src=this.pile(from.type,from.index);dest.push(...src.splice(from.start));if(src.length&&from.type==='column')src[src.length-1].up=true;return true;}
  get won(){return this.foundations.every(p=>p.length===13);}
 }
 return{Blocks,Solitaire,shapes,red};
});
