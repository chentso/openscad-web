import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { Eye, Box, RotateCcw, Compass, Crosshair } from "lucide-react";

export interface Viewport3DHandle {
  getSnapshot: () => string | null;
  resetCamera: () => void;
  setView: (view: "iso" | "top" | "front" | "right") => void;
}

interface Viewport3DProps {
  stlData: ArrayBuffer | string | null;
  isLoading: boolean;
  renderTimeMs?: number;
  engineName?: string;
  errorMessage?: string;
  theme?: "dark" | "light";
}

export const Viewport3D = forwardRef<Viewport3DHandle, Viewport3DProps>(({
  stlData,
  isLoading,
  renderTimeMs,
  engineName,
  errorMessage: externalError,
  theme = "dark"
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const edgesRef = useRef<THREE.LineSegments | null>(null);
  const boxHelperRef = useRef<THREE.BoxHelper | null>(null);
  const axesGroupRef = useRef<THREE.Group | null>(null);

  const [wireframe, setWireframe] = useState(false);
  const [showAxes, setShowAxes] = useState(true);
  const [showBox] = useState(false);
  const [showEdges, setShowEdges] = useState(true);
  const [polyCount, setPolyCount] = useState<number | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // Position camera matching OpenSCAD's default view
  // OpenSCAD default: Elevation = 55 deg, Azimuth = 25 deg, FOV = 25 deg
  const alignCameraToView = (view: "iso" | "top" | "front" | "right" = "iso") => {
    if (!cameraRef.current || !controlsRef.current) return;

    let center = new THREE.Vector3(0, 0, 0);
    let radius = 25;

    if (meshRef.current) {
      const geometry = meshRef.current.geometry;
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();

      const box = geometry.boundingBox;
      const sphere = geometry.boundingSphere;

      if (box && sphere && !isNaN(sphere.radius) && sphere.radius > 0) {
        box.getCenter(center);
        radius = sphere.radius;
      }
    }

    const camera = cameraRef.current;
    const controls = controlsRef.current;

    // Calculate distance so object fills ~65% of viewport
    const fovRad = (camera.fov * Math.PI) / 360;
    const distance = (radius * 1.5) / Math.sin(fovRad);

    camera.near = Math.max(0.1, radius / 50);
    camera.far = Math.max(5000, distance * 5);

    if (view === "top") {
      camera.position.set(center.x, center.y + distance, center.z + 0.0001);
    } else if (view === "front") {
      camera.position.set(center.x, center.y, center.z + distance);
    } else if (view === "right") {
      camera.position.set(center.x + distance, center.y, center.z);
    } else {
      // OpenSCAD standard Isometric View: Elevation 55 deg, Azimuth 25 deg
      const elev = THREE.MathUtils.degToRad(55);
      const azim = THREE.MathUtils.degToRad(25);
      const x = center.x + distance * Math.cos(elev) * Math.sin(azim);
      const y = center.y + distance * Math.sin(elev);
      const z = center.z + distance * Math.cos(elev) * Math.cos(azim);
      camera.position.set(x, y, z);
    }

    controls.target.copy(center);
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    controls.update();
  };

  useImperativeHandle(ref, () => ({
    getSnapshot: () => {
      if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return null;
      rendererRef.current.render(sceneRef.current, cameraRef.current);
      return rendererRef.current.domElement.toDataURL("image/png");
    },
    resetCamera: () => {
      alignCameraToView("iso");
    },
    setView: (view) => {
      alignCameraToView(view);
    }
  }));

  // Create OpenSCAD continuous 3-Axis Crosshairs with 10mm graduation grid/ticks
  const buildOpenSCADAxes = (extent: number = 2500, tickExtent: number = 400): THREE.Group => {
    const group = new THREE.Group();

    // 1. Full-span Continuous Axis Lines
    // X Axis (Red)
    const xPoints = [new THREE.Vector3(-extent, 0, 0), new THREE.Vector3(extent, 0, 0)];
    const xGeo = new THREE.BufferGeometry().setFromPoints(xPoints);
    const xMat = new THREE.LineBasicMaterial({ color: 0xef4444, linewidth: 2 });
    group.add(new THREE.Line(xGeo, xMat));

    // Y Axis (Green) - OpenSCAD Y is Three.js -Z
    const yPoints = [new THREE.Vector3(0, 0, extent), new THREE.Vector3(0, 0, -extent)];
    const yGeo = new THREE.BufferGeometry().setFromPoints(yPoints);
    const yMat = new THREE.LineBasicMaterial({ color: 0x22c55e, linewidth: 2 });
    group.add(new THREE.Line(yGeo, yMat));

    // Z Axis (Blue) - OpenSCAD Z is Three.js +Y
    const zPoints = [new THREE.Vector3(0, -extent, 0), new THREE.Vector3(0, extent, 0)];
    const zGeo = new THREE.BufferGeometry().setFromPoints(zPoints);
    const zMat = new THREE.LineBasicMaterial({ color: 0x3b82f6, linewidth: 2 });
    group.add(new THREE.Line(zGeo, zMat));

    // 2. 10mm Ticks along each of the 3 axes (no plane grid)
    const tickPoints: THREE.Vector3[] = [];

    for (let d = -tickExtent; d <= tickExtent; d += 10) {
      if (d === 0) continue;
      const isMajor100 = d % 100 === 0;
      const isMajor50 = d % 50 === 0;
      const tickSize = isMajor100 ? 4 : (isMajor50 ? 2.8 : 1.5);

      // X Axis Ticks: lie flat on the ground plane (parallel to OpenSCAD Y)
      tickPoints.push(new THREE.Vector3(d, 0, -tickSize), new THREE.Vector3(d, 0, tickSize));

      // Y Axis Ticks: lie flat on the ground plane (parallel to OpenSCAD X)
      tickPoints.push(new THREE.Vector3(-tickSize, 0, d), new THREE.Vector3(tickSize, 0, d));

      // Z Axis Ticks: horizontal notches across the vertical Z axis
      tickPoints.push(new THREE.Vector3(-tickSize, d, 0), new THREE.Vector3(tickSize, d, 0));
    }

    // Add tick notches to the axes
    const tickGeo = new THREE.BufferGeometry().setFromPoints(tickPoints);
    const tickMat = new THREE.LineBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.75 });
    group.add(new THREE.LineSegments(tickGeo, tickMat));

    return group;
  };

  // Initialize Three.js scene once
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const w = container.clientWidth || 600;
    const h = container.clientHeight || 400;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(theme === "light" ? "#f1f5f9" : "#1e1e24"); // OpenSCAD canvas tone
    sceneRef.current = scene;

    // Camera (FOV 25 matching OpenSCAD's telephoto CAD perspective)
    const camera = new THREE.PerspectiveCamera(25, w / h, 0.1, 8000);
    camera.position.set(100, 100, 120);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    renderer.shadowMap.enabled = true;

    // Absolute positioned canvas to prevent any ResizeObserver feedback loops
    const canvas = renderer.domElement;
    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    container.appendChild(canvas);
    rendererRef.current = renderer;

    // Orbit Controls
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    // OpenSCAD style mouse mapping: Left click rotate, Right click pan
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN
    };
    controlsRef.current = controls;

    // OpenSCAD Lighting: Soft ambient + crisp key directional
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight1.position.set(150, 200, 100);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xcfd8dc, 0.45);
    dirLight2.position.set(-150, -100, -100);
    scene.add(dirLight2);

    // Continuous OpenSCAD 3-Axis Crosshairs with 10mm ticks & grid
    const axes = buildOpenSCADAxes(2500, 400);
    scene.add(axes);
    axesGroupRef.current = axes;

    // Render loop
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Debounced Resize Observer
    let resizeTimer: number;
    const resizeObserver = new ResizeObserver((entries) => {
      cancelAnimationFrame(resizeTimer);
      resizeTimer = requestAnimationFrame(() => {
        if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
        const entry = entries[0];
        const newW = entry.contentRect.width;
        const newH = entry.contentRect.height;
        if (newW <= 0 || newH <= 0) return;

        cameraRef.current.aspect = newW / newH;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(newW, newH, false);
      });
    });
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animId);
      cancelAnimationFrame(resizeTimer);
      resizeObserver.disconnect();
      renderer.dispose();
      if (container && canvas) {
        container.removeChild(canvas);
      }
    };
  }, []);

  // Handle STL updates
  useEffect(() => {
    if (!sceneRef.current) return;

    if (!stlData) {
      if (meshRef.current) {
        sceneRef.current.remove(meshRef.current);
        meshRef.current.geometry.dispose();
        meshRef.current = null;
      }
      if (edgesRef.current) {
        sceneRef.current.remove(edgesRef.current);
        edgesRef.current = null;
      }
      if (boxHelperRef.current) {
        sceneRef.current.remove(boxHelperRef.current);
        boxHelperRef.current = null;
      }
      setPolyCount(null);
      return;
    }

    try {
      setParseError(null);
      const loader = new STLLoader();
      let geometry: THREE.BufferGeometry;

      if (typeof stlData === "string") {
        geometry = loader.parse(stlData);
      } else {
        geometry = loader.parse(stlData);
      }

      if (!geometry || geometry.attributes.position.count === 0) {
        setParseError("Parsed geometry contains 0 vertices. The model might be empty or invalid.");
        return;
      }

      // Convert OpenSCAD CAD coordinates (Z-up) to Three.js WebGL coordinates (Y-up)
      // OpenSCAD: Z is UP, XY is ground
      // Three.js: Y is UP, XZ is ground
      geometry.rotateX(-Math.PI / 2);
      geometry.computeVertexNormals();

      // Remove previous mesh & edges
      if (meshRef.current) {
        sceneRef.current.remove(meshRef.current);
        meshRef.current.geometry.dispose();
      }
      if (edgesRef.current) {
        sceneRef.current.remove(edgesRef.current);
        edgesRef.current.geometry.dispose();
      }
      if (boxHelperRef.current) {
        sceneRef.current.remove(boxHelperRef.current);
      }

      // Classic OpenSCAD Cornfield Gold Material
      const material = new THREE.MeshStandardMaterial({
        color: 0xfacc15, // OpenSCAD warm gold
        roughness: 0.35,
        metalness: 0.05,
        wireframe: wireframe,
        side: THREE.DoubleSide
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      sceneRef.current.add(mesh);
      meshRef.current = mesh;

      // Add OpenSCAD CAD feature outlines (edges)
      const edgesGeometry = new THREE.EdgesGeometry(geometry, 24); // Threshold angle
      const edgesMaterial = new THREE.LineBasicMaterial({
        color: 0x451a03, // Dark amber outline
        linewidth: 1
      });
      const edgesLines = new THREE.LineSegments(edgesGeometry, edgesMaterial);
      edgesLines.visible = showEdges && !wireframe;
      sceneRef.current.add(edgesLines);
      edgesRef.current = edgesLines;

      // Update polygon count
      const triangles = geometry.attributes.position.count / 3;
      setPolyCount(triangles);

      // Bounding Box
      const boxHelper = new THREE.BoxHelper(mesh, 0x38bdf8);
      boxHelper.visible = showBox;
      sceneRef.current.add(boxHelper);
      boxHelperRef.current = boxHelper;

      // Center the camera on the model (OpenSCAD View All behavior)
      alignCameraToView("iso");
    } catch (err: any) {
      console.error("STLLoader error:", err);
      setParseError(`Failed to parse 3D mesh: ${err.message || String(err)}`);
    }
  }, [stlData]);

  // Theme background update
  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.background = new THREE.Color(theme === "light" ? "#f1f5f9" : "#1e1e24");
    }
  }, [theme]);

  // Wireframe toggle
  useEffect(() => {
    if (meshRef.current) {
      (meshRef.current.material as THREE.MeshStandardMaterial).wireframe = wireframe;
    }
    if (edgesRef.current) {
      edgesRef.current.visible = showEdges && !wireframe;
    }
  }, [wireframe, showEdges]);

  // Axes toggle
  useEffect(() => {
    if (axesGroupRef.current) {
      axesGroupRef.current.visible = showAxes;
    }
  }, [showAxes]);

  // Box toggle
  useEffect(() => {
    if (boxHelperRef.current) {
      boxHelperRef.current.visible = showBox;
    }
  }, [showBox]);

  const activeError = externalError || parseError;

  return (
    <div className={`relative w-full h-full overflow-hidden select-none ${theme === "light" ? "bg-slate-100" : "bg-zinc-950"}`}>
      {/* 3D Canvas Mount Point */}
      <div ref={containerRef} className="absolute inset-0 overflow-hidden" />

      {/* Top HUD Overlay */}
      <div className={`absolute top-3 left-3 flex items-center gap-2 backdrop-blur-md px-3 py-1.5 rounded-lg border text-xs pointer-events-none transition-colors ${
        theme === "light"
          ? "bg-white/90 border-slate-200 text-slate-700 shadow-xs"
          : "bg-zinc-900/80 border-zinc-700/60 text-zinc-300"
      }`}>
        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className={`font-semibold ${theme === "light" ? "text-slate-900" : "text-zinc-100"}`}>
          {engineName || "OpenSCAD Nightly"}
        </span>
        {renderTimeMs !== undefined && (
          <span className={theme === "light" ? "text-slate-500" : "text-zinc-400"}>({renderTimeMs}ms)</span>
        )}
        {polyCount !== null && (
          <span className={theme === "light" ? "text-slate-500" : "text-zinc-400"}>• {polyCount.toLocaleString()} triangles</span>
        )}
      </div>

      {/* Quick View Presets (OpenSCAD Style: Top, Front, Right, Iso) */}
      <div className={`absolute top-3 left-1/2 -translate-x-1/2 flex items-center backdrop-blur-md p-1 rounded-lg border text-xs z-10 gap-1 transition-colors ${
        theme === "light"
          ? "bg-white/90 border-slate-200 text-slate-700 shadow-xs"
          : "bg-zinc-900/80 border-zinc-700/60 text-zinc-300"
      }`}>
        <button
          onClick={() => alignCameraToView("top")}
          className={`px-2 py-0.5 rounded text-[11px] font-mono transition ${
            theme === "light" ? "hover:bg-slate-100 text-slate-700" : "hover:bg-zinc-800"
          }`}
        >
          Top
        </button>
        <button
          onClick={() => alignCameraToView("front")}
          className={`px-2 py-0.5 rounded text-[11px] font-mono transition ${
            theme === "light" ? "hover:bg-slate-100 text-slate-700" : "hover:bg-zinc-800"
          }`}
        >
          Front
        </button>
        <button
          onClick={() => alignCameraToView("right")}
          className={`px-2 py-0.5 rounded text-[11px] font-mono transition ${
            theme === "light" ? "hover:bg-slate-100 text-slate-700" : "hover:bg-zinc-800"
          }`}
        >
          Right
        </button>
        <button
          onClick={() => alignCameraToView("iso")}
          className={`px-2 py-0.5 rounded text-[11px] font-mono transition flex items-center gap-1 ${
            theme === "light"
              ? "bg-orange-50 text-orange-600 font-semibold border border-orange-200"
              : "bg-zinc-800 text-orange-400"
          }`}
        >
          <Compass size={11} />
          Iso (55°, 25°)
        </button>
      </div>

      {/* Viewport Control Tools (Right side) */}
      <div className={`absolute top-3 right-3 flex items-center gap-1.5 backdrop-blur-md p-1 rounded-lg border z-10 transition-colors ${
        theme === "light"
          ? "bg-white/90 border-slate-200 text-slate-700 shadow-xs"
          : "bg-zinc-900/80 border-zinc-700/60 text-zinc-300"
      }`}>
        <button
          onClick={() => setShowEdges(!showEdges)}
          title="Toggle CAD Feature Edges"
          className={`p-1.5 rounded transition ${
            showEdges
              ? (theme === "light" ? "text-amber-600 bg-amber-50" : "text-amber-400 bg-zinc-800")
              : (theme === "light" ? "hover:bg-slate-100" : "hover:bg-zinc-800")
          }`}
        >
          <Eye size={16} />
        </button>
        <button
          onClick={() => setWireframe(!wireframe)}
          title="Toggle Pure Wireframe"
          className={`p-1.5 rounded transition ${
            wireframe
              ? (theme === "light" ? "text-orange-600 bg-orange-50" : "text-orange-400 bg-zinc-800")
              : (theme === "light" ? "hover:bg-slate-100" : "hover:bg-zinc-800")
          }`}
        >
          <Box size={16} />
        </button>
        <button
          onClick={() => setShowAxes(!showAxes)}
          title="Toggle OpenSCAD Axes (10mm ticks)"
          className={`p-1.5 rounded transition ${
            showAxes
              ? (theme === "light" ? "text-cyan-700 bg-cyan-50" : "text-cyan-400 bg-zinc-800")
              : (theme === "light" ? "hover:bg-slate-100" : "hover:bg-zinc-800")
          }`}
        >
          <Crosshair size={16} />
        </button>
        <button
          onClick={() => alignCameraToView("iso")}
          title="Reset Camera View (View All)"
          className={`p-1.5 rounded transition ${theme === "light" ? "hover:bg-slate-100" : "hover:bg-zinc-800"}`}
        >
          <RotateCcw size={16} />
        </button>
      </div>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex flex-col items-center justify-center pointer-events-none z-20">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-orange-200 mt-2 font-mono">Rendering with Manifold...</span>
        </div>
      )}

      {/* Error Banner */}
      {activeError && (
        <div className="absolute bottom-3 left-3 right-3 bg-red-950/95 border border-red-700 text-red-200 p-2.5 rounded-lg text-xs font-mono max-h-32 overflow-y-auto whitespace-pre-wrap z-20 shadow-lg">
          {activeError}
        </div>
      )}
    </div>
  );
});
