'use strict';
let points=0;
document.querySelector('#demo-add').addEventListener('click',()=>document.querySelector('#demo-counter').textContent=String(++points));
document.querySelector('#demo-reset').addEventListener('click',()=>{points=0;document.querySelector('#demo-counter').textContent='0';});
document.querySelector('#demo-text').addEventListener('input',e=>document.querySelector('#demo-echo').textContent=e.target.value||'Aucun texte');
