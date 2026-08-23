import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  getCanvasPanoramaOffsetY,
  updateCanvasPanoramaOffsetX,
  updatePanoramaPitch,
  updatePanoramaYaw,
} from "@/components/common/panoramaInteraction";

// 360° 全景预览（无第三方依赖），按环境能力降级：
// 1) WebGL：把等距柱状全景图贴到球面内壁，透视正确的拖拽环视 + 滚轮缩放；
// 2) Canvas 2D（2026-08-23：内嵌 webview 常无 WebGL——实测用户环境 canvas 数为 0、
//    静态回退导致完全不能拖）：水平拖拽环视（左右无缝循环）+ ±60° 俯仰限幅 + 滚轮缩放，
//    不是透视投影但保留「拖拽看一圈」的核心体验；
// 3) 连 2D 都没有：退回静态平面图。
// 场景状态图的生成契约就是等距柱状全景（见 StoryAssetStateImageService.buildStateImagePrompt 的 scene 分支）。

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

type ViewerMode = "webgl" | "canvas2d" | "static";

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

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("全景图加载失败。"));
    image.src = src;
  });
}

export default function PanoramaViewer(props: {
  src: string;
  alt: string;
  className?: string;
}) {
  const { src, alt, className } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mode, setMode] = useState<ViewerMode>("webgl");

  // ── WebGL 球面渲染（首选） ────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== "webgl") {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const gl = canvas.getContext("webgl", { antialias: true, alpha: false }) as WebGLRenderingContext | null
      ?? canvas.getContext("experimental-webgl") as WebGLRenderingContext | null;
    if (!gl) {
      setMode("canvas2d");
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
      setMode("canvas2d");
      return;
    }

    const uniformTex = gl.getUniformLocation(program, "u_tex");
    const uniformYaw = gl.getUniformLocation(program, "u_yaw");
    const uniformPitch = gl.getUniformLocation(program, "u_pitch");
    const uniformFov = gl.getUniformLocation(program, "u_fov");
    const uniformAspect = gl.getUniformLocation(program, "u_aspect");
    const attribPos = gl.getAttribLocation(program, "a_pos");

    loadImage(src).then((image) => {
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
    }).catch(() => setMode("static"));

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
      view.yaw = updatePanoramaYaw(view.yaw, event.clientX - lastX, scale);
      view.pitch = updatePanoramaPitch(view.pitch, event.clientY - lastY, scale);
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
      // 注意：这里不能调 WEBGL_lose_context().loseContext()——React StrictMode 开发模式
      // 会双挂载 effect，杀掉上下文后第二次挂载拿到的是死上下文（着色器校验全失败），
      // 再降级 Canvas 2D 时同一个 canvas 元素又拿不到第二种类型的上下文 → 静态图。
      // 上下文交给页面生命周期回收即可。
    };
  }, [mode, src]);

  // ── Canvas 2D 环视回退（无 WebGL 的内嵌 webview） ─────────────────────────
  // 等距柱状全景按水平偏移绘制、左右无缝循环；滚轮缩放；垂直拖拽统一限幅在 ±60°。
  useEffect(() => {
    if (mode !== "canvas2d") {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setMode("static");
      return;
    }

    let disposed = false;
    let image: HTMLImageElement | null = null;
    let frame = 0;
    let dirty = true;
    let width = 1;
    let height = 1;
    // 视口状态：zoom=可见高度占整图高度的比例（越小看得越远）；offsetX 用源像素单位水平循环；
    // pitch 用弧度表示俯仰角（0=垂直居中）。
    const view = { zoom: 1, offsetX: 0, pitch: 0 };

    loadImage(src).then((loaded) => {
      if (disposed) {
        return;
      }
      image = loaded;
      dirty = true;
    }).catch(() => setMode("static"));

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
      dirty = true;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const draw = () => {
      if (!dirty || !image) {
        return;
      }
      const imgW = image.naturalWidth || 1;
      const imgH = image.naturalHeight || 1;
      // 可见窗口（源像素）：高度 = 整图高度 / zoom，宽度按视口宽高比推——保证画面不变形。
      const srcH = imgH / view.zoom;
      const srcW = Math.min(imgW, srcH * (width / height));
      // 垂直窗口中心：由统一俯仰角换算，并限制在图像可裁剪范围内。
      const centerY = imgH / 2 + getCanvasPanoramaOffsetY(view.pitch, imgH, srcH);
      const sy = Math.max(0, Math.min(imgH - srcH, centerY - srcH / 2));
      // 水平起点做无缝循环（负偏移也归一到 [0, imgW)）。
      const sx = ((view.offsetX % imgW) + imgW) % imgW;
      ctx.clearRect(0, 0, width, height);
      const firstW = Math.min(srcW, imgW - sx);
      ctx.drawImage(image, sx, sy, firstW, srcH, 0, 0, (firstW / srcW) * width, height);
      if (firstW < srcW) {
        // 右边界不够：从图最左再续一段，保证水平拖动跨接缝时画面连续。
        const restW = srcW - firstW;
        ctx.drawImage(image, 0, sy, restW, srcH, (firstW / srcW) * width, 0, (restW / srcW) * width, height);
      }
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
      if (!dragging || !image) {
        return;
      }
      const imgH = image.naturalHeight || 1;
      const srcH = imgH / view.zoom;
      const srcW = Math.min(image.naturalWidth || 1, srcH * (width / height));
      // 屏幕像素 → 源像素比例，拖动 1:1 跟手；水平拖拽方向与视角方向一致。
      const pxPerScreen = srcW / Math.max(1, canvas.clientWidth);
      view.offsetX = updateCanvasPanoramaOffsetX(view.offsetX, event.clientX - lastX, pxPerScreen);
      const pitchScale = (Math.PI / 2) / Math.max(1, canvas.clientHeight);
      view.pitch = updatePanoramaPitch(view.pitch, event.clientY - lastY, pitchScale);
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
      view.zoom = Math.max(1, Math.min(4, view.zoom * (1 - event.deltaY * 0.0012)));
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
    };
  }, [mode, src]);

  if (mode === "static") {
    return <img src={src} alt={alt} className={cn("h-full w-full object-cover", className)} />;
  }
  return (
    <canvas
      // 模式切换时必须换新元素：一个 canvas 只能持有一种上下文类型，
      // WebGL 失败后降级 2D 若复用旧 canvas 会拿到 null 上下文。
      key={mode}
      ref={canvasRef}
      role="img"
      aria-label={alt}
      className={cn("block h-full w-full touch-none select-none", className)}
    />
  );
}
