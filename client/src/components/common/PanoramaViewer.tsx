import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// 360° 全景预览：把等距柱状全景图贴到球面内壁上拖拽环视（WebGL 着色器反向投影，
// 无第三方依赖）。场景状态图的生成契约就是等距柱状全景（见
// StoryAssetStateImageService.buildStateImagePrompt 的 scene 分支）。
// WebGL 不可用时退回平面图，功能不缺失。

const VERTEX_SHADER = `
attribute vec2 a_pos;
varying vec2 v_ndc;
void main() {
  v_ndc = a_pos;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision mediump float;
varying vec2 v_ndc;
uniform sampler2D u_tex;
uniform float u_yaw;
uniform float u_pitch;
uniform float u_fov;
uniform float u_aspect;
void main() {
  float halfTan = tan(u_fov * 0.5);
  vec3 dir = normalize(vec3(v_ndc.x * u_aspect * halfTan, v_ndc.y * halfTan, -1.0));
  float cosP = cos(u_pitch);
  float sinP = sin(u_pitch);
  vec3 pitched = vec3(dir.x, dir.y * cosP - dir.z * sinP, dir.y * sinP + dir.z * cosP);
  float cosY = cos(u_yaw);
  float sinY = sin(u_yaw);
  vec3 world = vec3(pitched.x * cosY + pitched.z * sinY, pitched.y, -pitched.x * sinY + pitched.z * cosY);
  float u = fract(atan(world.x, -world.z) / 6.28318530718 + 0.5);
  float v = acos(clamp(world.y, -1.0, 1.0)) / 3.14159265359;
  gl_FragColor = texture2D(u_tex, vec2(u, v));
}
`;

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error("无法创建着色器。");
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? "着色器编译失败。");
  }
  return shader;
}

export default function PanoramaViewer(props: {
  src: string;
  alt: string;
  className?: string;
}) {
  const { src, alt, className } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const gl = canvas.getContext("webgl", { antialias: true, alpha: false }) as WebGLRenderingContext | null;
    if (!gl) {
      setFallback(true);
      return;
    }

    let disposed = false;
    let texture: WebGLTexture | null = null;
    let frame = 0;
    let dirty = true;
    let width = 1;
    let height = 1;
    const view = { yaw: 0, pitch: 0, fov: (90 * Math.PI) / 180 };

    let program: WebGLProgram;
    let buffer: WebGLBuffer;
    try {
      program = gl.createProgram()!;
      gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
      gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) ?? "着色器链接失败。");
      }
      buffer = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    } catch {
      setFallback(true);
      return;
    }

    const uniformTex = gl.getUniformLocation(program, "u_tex");
    const uniformYaw = gl.getUniformLocation(program, "u_yaw");
    const uniformPitch = gl.getUniformLocation(program, "u_pitch");
    const uniformFov = gl.getUniformLocation(program, "u_fov");
    const uniformAspect = gl.getUniformLocation(program, "u_aspect");
    const attribPos = gl.getAttribLocation(program, "a_pos");

    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      if (disposed) {
        return;
      }
      texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      // NPOT 纹理不能用 REPEAT/多级 mipmap；水平无缝环绕在着色器里用 fract() 完成。
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      dirty = true;
    };
    image.src = src;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const nextWidth = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const nextHeight = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (nextWidth === width && nextHeight === height) {
        return;
      }
      width = nextWidth;
      height = nextHeight;
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
      dirty = true;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const draw = () => {
      if (!dirty || !texture) {
        return;
      }
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(attribPos);
      gl.vertexAttribPointer(attribPos, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(uniformTex, 0);
      gl.uniform1f(uniformYaw, view.yaw);
      gl.uniform1f(uniformPitch, view.pitch);
      gl.uniform1f(uniformFov, view.fov);
      gl.uniform1f(uniformAspect, width / height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      dirty = false;
    };
    const loop = () => {
      if (disposed) {
        return;
      }
      draw();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    // 拖拽 = 抓住画面环视（角度变化与拖拽距离成 1:1 抓取感）；滚轮缩放视野。
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const onPointerDown = (event: PointerEvent) => {
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
      canvas.style.cursor = "grabbing";
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) {
        return;
      }
      const scale = view.fov / Math.max(1, canvas.clientHeight);
      view.yaw -= (event.clientX - lastX) * scale;
      view.pitch = Math.max(-1.45, Math.min(1.45, view.pitch + (event.clientY - lastY) * scale));
      lastX = event.clientX;
      lastY = event.clientY;
      dirty = true;
    };
    const onPointerUp = (event: PointerEvent) => {
      dragging = false;
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
      canvas.style.cursor = "grab";
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      view.fov = Math.max((30 * Math.PI) / 180, Math.min((120 * Math.PI) / 180, view.fov * (1 + event.deltaY * 0.0012)));
      dirty = true;
    };
    canvas.style.cursor = "grab";
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      if (texture) {
        gl.deleteTexture(texture);
      }
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [src]);

  if (fallback) {
    return <img src={src} alt={alt} className={cn("h-full w-full object-cover", className)} />;
  }
  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={alt}
      className={cn("block h-full w-full touch-none select-none", className)}
    />
  );
}
