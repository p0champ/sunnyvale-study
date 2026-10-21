export async function environmentCamera(devices = navigator.mediaDevices) {
  const stream = await devices.getUserMedia({video:{facingMode:{exact:'environment'},width:{ideal:1280},height:{ideal:960}},audio:false});
  const track = stream.getVideoTracks()[0], settings = track?.getSettings() || {};
  if (settings.facingMode !== 'environment' || /avatar|selfie|virtual/i.test(track?.label || '')) {
    stream.getTracks().forEach(t=>t.stop());
    throw Error('This browser exposes a virtual/selfie camera rather than the real page.');
  }
  return stream;
}
export function rawCamera(renderer) {
  try {
    const frame=renderer.xr.getFrame?.(), reference=renderer.xr.getReferenceSpace?.();
    return frame && reference ? frame.getViewerPose(reference)?.views.find(view=>view.camera)?.camera || null : null;
  } catch { return null; }
}
// Run only inside the current XR animation frame, after an explicit Capture tap.
export function rawCameraImage(renderer, camera) {
  const gl=renderer.getContext(), binding=renderer.xr.getBinding?.();
  if (!binding?.getCameraImage) throw Error('Raw headset camera images are not available in this browser.');
  const texture=binding.getCameraImage(camera);
  if(!texture || !gl.createVertexArray)throw Error('Camera capture requires a readable WebGL 2 camera texture.');
  // Camera textures belong to the browser. Sample into our own texture instead
  // of attaching an opaque camera texture to a framebuffer or modifying it.
  const old={draw:gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),read:gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),
    program:gl.getParameter(gl.CURRENT_PROGRAM),vao:gl.getParameter(gl.VERTEX_ARRAY_BINDING),
    viewport:gl.getParameter(gl.VIEWPORT),mask:gl.getParameter(gl.COLOR_WRITEMASK),active:gl.getParameter(gl.ACTIVE_TEXTURE)};
  gl.activeTexture(gl.TEXTURE0);old.texture=gl.getParameter(gl.TEXTURE_BINDING_2D);
  const flags=[gl.SCISSOR_TEST,gl.BLEND,gl.DEPTH_TEST,gl.CULL_FACE,gl.STENCIL_TEST,gl.RASTERIZER_DISCARD].map(flag=>[flag,gl.isEnabled(flag)]);
  const pixels=new Uint8Array(camera.width*camera.height*4),fbo=gl.createFramebuffer(),output=gl.createTexture(),vao=gl.createVertexArray(),program=gl.createProgram(),shaders=[];
  try {
    function shader(type,source){const value=gl.createShader(type);shaders.push(value);gl.shaderSource(value,source);gl.compileShader(value);if(!gl.getShaderParameter(value,gl.COMPILE_STATUS))throw Error('Camera copy shader is unavailable.');gl.attachShader(program,value);}
    shader(gl.VERTEX_SHADER,'#version 300 es\n out vec2 uv;void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=p;gl_Position=vec4(p*2.0-1.0,0,1);}');
    shader(gl.FRAGMENT_SHADER,'#version 300 es\n precision highp float;uniform sampler2D cameraImage;in vec2 uv;out vec4 color;void main(){color=texture(cameraImage,uv);}');
    gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Camera copy is unavailable.');
    gl.bindTexture(gl.TEXTURE_2D,output);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,camera.width,camera.height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,output,0);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('The browser cannot copy this camera image.');
    flags.forEach(([flag])=>gl.disable(flag));gl.colorMask(true,true,true,true);gl.viewport(0,0,camera.width,camera.height);
    gl.useProgram(program);gl.bindVertexArray(vao);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(gl.getUniformLocation(program,'cameraImage'),0);gl.drawArrays(gl.TRIANGLES,0,3);
    gl.readPixels(0,0,camera.width,camera.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
  }finally{
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,old.draw);gl.bindFramebuffer(gl.READ_FRAMEBUFFER,old.read);gl.useProgram(old.program);gl.bindVertexArray(old.vao);
    gl.viewport(...old.viewport);gl.colorMask(...old.mask);flags.forEach(([flag,on])=>on?gl.enable(flag):gl.disable(flag));
    gl.bindTexture(gl.TEXTURE_2D,old.texture);gl.activeTexture(old.active);
    gl.deleteFramebuffer(fbo);gl.deleteTexture(output);gl.deleteVertexArray(vao);gl.deleteProgram(program);shaders.forEach(shader=>gl.deleteShader(shader));
  }
  const canvas=document.createElement('canvas');canvas.width=camera.width;canvas.height=camera.height;
  const g=canvas.getContext('2d'), image=g.createImageData(camera.width,camera.height);
  for(let y=0;y<camera.height;y++)image.data.set(pixels.subarray((camera.height-y-1)*camera.width*4,(camera.height-y)*camera.width*4),y*camera.width*4);
  g.putImageData(image,0,0);return canvas.toDataURL('image/jpeg',.9);
}
