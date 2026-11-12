/* NEXORA PNG sprite avatar engine.
 * Layered raster parts + sprite-sheet animation. Legacy SVG renderer remains the fallback.
 */
(()=> {
  "use strict";
  const DEFAULTS = {
    width: 180, height: 300, frameRate: 8,
    anchors: {
      shoes:{x:43,y:260,w:94,h:35}, body:{x:30,y:92,w:120,h:175},
      outfit:{x:28,y:98,w:124,h:165}, head:{x:48,y:8,w:84,h:92},
      hair:{x:42,y:2,w:96,h:110}, accessories:{x:30,y:0,w:120,h:285}
    },
    order:["shoes","body","outfit","head","hair","accessories"]
  };
  const cache = new Map();
  const catalog = Object.freeze({
    version:1,
    // Paths are intentionally explicit. Missing artwork falls back to the existing SVG renderer.
    parts:{
      heads:["heads/head-01.png","heads/head-02.png","heads/head-03.png"],
      bodies:["bodies/body-slim.png","bodies/body-classic.png","bodies/body-athletic.png"],
      hair:["hair/hair-short.png","hair/hair-long.png","hair/hair-curly.png"],
      outfits:["outfits/outfit-casual.png","outfits/outfit-jacket.png"],
      shoes:["shoes/shoes-sneakers.png","shoes/shoes-boots.png"],
      accessories:["accessories/glasses.png","accessories/halo.png","accessories/wings.png"]
    },
    animations:{
      idle:{frames:4,fps:4}, walk:{frames:8,fps:12},
      dance:{frames:8,fps:10}, happy:{frames:6,fps:8}
    }
  });
  function loadImage(src) {
    if(cache.has(src)) return cache.get(src);
    const promise=new Promise((resolve,reject)=>{
      const image=new Image();
      image.decoding="async";
      image.onload=()=>resolve(image);
      image.onerror=()=>reject(new Error("Sprite not found: "+src));
      image.src=src;
    });
    cache.set(src,promise);
    promise.catch(()=>cache.delete(src));
    return promise;
  }
  class SpriteAvatar {
    constructor(canvas, options={}) {
      if(!canvas || typeof canvas.getContext!=="function") throw new TypeError("A canvas element is required");
      this.canvas=canvas; this.ctx=canvas.getContext("2d");
      if(!this.ctx) throw new Error("2D canvas context is unavailable");
      this.options={...DEFAULTS,...options,anchors:{...DEFAULTS.anchors,...(options.anchors||{})}};
      this.look={}; this.animation="idle"; this.direction="front";
      this.frame=0; this.lastTick=0; this.raf=0; this.destroyed=false;
      this.images=new Map(); this.dpr=Math.min(window.devicePixelRatio||1,2);
      this.resize();
    }
    resize(){
      const {width,height}=this.options;
      this.canvas.width=Math.round(width*this.dpr);
      this.canvas.height=Math.round(height*this.dpr);
      this.canvas.style.width=width+"px"; this.canvas.style.height=height+"px";
      this.ctx.setTransform(this.dpr,0,0,this.dpr,0,0);
      this.draw();
    }
    async setLook(look={}) {
      this.look={...look};
      const sources=Object.values(look).filter(v=>typeof v==="string"&&/\.png(?:\?|$)/i.test(v));
      await Promise.all(sources.map(async src=>this.images.set(src,await loadImage(src))));
      this.draw();
      return this;
    }
    setAnimation(name){
      if(!catalog.animations[name]) name="idle";
      if(this.animation!==name){this.animation=name;this.frame=0;this.lastTick=0;this.draw();}
    }
    setDirection(direction){
      this.direction=["front","back","left","right"].includes(direction)?direction:"front";
      this.draw();
    }
    drawPart(key,src){
      if(!src) return;
      let image=this.images.get(src);
      if(!image){
        loadImage(src).then(loaded=>{
          if(this.destroyed||this.look[key]!==src)return;
          this.images.set(src,loaded);
          this.draw();
        }).catch(error=>this.canvas.dispatchEvent(new CustomEvent("spriteerror",{detail:{part:key,src,error}})));
        return;
      }
      const anchor=this.options.anchors[key]||{x:0,y:0,w:this.options.width,h:this.options.height};
      const meta=this.look.frames?.[key]||{};
      const frames=Math.max(1,Number(meta.count)||1);
      const fw=Number(meta.width)||image.width/frames;
      const fh=Number(meta.height)||image.height/4;
      const rows=meta.directions||{front:0,back:1,left:2,right:3};
      const col=this.frame%frames, row=Number(rows[this.direction]??0);
      this.ctx.drawImage(image,col*fw,row*fh,fw,fh,anchor.x,anchor.y,anchor.w,anchor.h);
    }
    draw(timestamp=0){
      if(this.destroyed)return;
      const ctx=this.ctx;ctx.clearRect(0,0,this.options.width,this.options.height);
      // Stable synchronous compositing after each requested image has loaded.
      for(const key of this.options.order)this.drawPart(key,this.look[key],timestamp);
    }
    start(){
      if(this.raf||this.destroyed)return;
      const tick=(time)=>{
        if(this.destroyed)return;
        const animation=catalog.animations[this.animation]||catalog.animations.idle;
        const interval=1000/(Number(animation.fps)||this.options.frameRate);
        if(time-this.lastTick>=interval){this.frame=(this.frame+1)%animation.frames;this.lastTick=time;this.draw(time);}
        this.raf=requestAnimationFrame(tick);
      };
      this.raf=requestAnimationFrame(tick);
      return this;
    }
    stop(){if(this.raf)cancelAnimationFrame(this.raf);this.raf=0;return this;}
    destroy(){this.stop();this.destroyed=true;this.images.clear();this.ctx.clearRect(0,0,this.options.width,this.options.height);}
  }
  function create(canvas,options){return new SpriteAvatar(canvas,options)}
  window.NexoraSpriteAvatar=Object.freeze({create,loadImage,catalog,SpriteAvatar,clearCache(){cache.clear();}});
})();