import React, { useEffect, useState, useRef } from "react";
import * as THREE from "three";
import { DracoGLTFLoader } from "./DracoGLTFLoader";
import { useInstrumentLoading } from './InstrumentLoadingContext';
import { useDeviceOrientation } from './DeviceOrientationContext';
import { getCurrentDeviceTilt } from './deviceTilt';

// TODO 
  // - All instruments are being loaded twice? Only in ev mode intentionally?
  // - Try to determine immediately whether to load & display the instruments or not
  // - Avoid displaying and then hiding by being sure of device/network capabilities

type MouseTrackingInstrumentProps = {
  modelPath: string;
  tall: boolean;
}

const MouseTrackingInstrument: React.FC<MouseTrackingInstrumentProps> = ({
  modelPath,
  tall,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const [instrumentLoaded, setInstrumentLoaded] = useState<boolean>(false);
  const { loadInstrumentsEnabled, disableInstrumentLoading } = useInstrumentLoading();
  const { tilt } = useDeviceOrientation();

  useEffect(() => {
    if (!containerRef.current || !loadInstrumentsEnabled) {
      return;
    }

    // Set up the scene, camera, and renderer
    const container = containerRef.current;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    camera.position.z = 1.25;

    const renderer = new THREE.WebGLRenderer({ alpha: true });
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    container.appendChild(renderer.domElement);

    let disposed = false;
    let resizeFrameId: number | null = null;
    let previousWidth = 0;
    let previousHeight = 0;
    let previousDisplayHeight = 0;

    const resizeRenderer = () => {
      resizeFrameId = null;
      if (disposed) return;
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (!width || !height) return;
      // Update size of renderer
      camera.aspect = width / height;
      // Keep the enlarged model at a steady visual size without using a tall
      // canvas to determine the height of the surrounding text section.
      const displayHeight = window.innerWidth <= 900
        // Use more of the mobile canvas without increasing its layout height.
        ? Math.min(560, Math.max(360, window.innerWidth * 1.4)) * 1.4 * (tall ? 1 : 0.81)
        : Math.min(720, Math.max(480, window.innerWidth * 0.55));
      if (width === previousWidth && height === previousHeight && displayHeight === previousDisplayHeight) return;
      previousWidth = width;
      previousHeight = height;
      previousDisplayHeight = displayHeight;

      camera.zoom = displayHeight / height;
      // Resize the drawing buffer only; CSS owns the canvas layout dimensions.
      renderer.setSize(width, height, false);

      camera.updateProjectionMatrix();
    };

    // Run observer-triggered writes outside the ResizeObserver delivery cycle.
    const onResize = () => {
      if (!disposed && resizeFrameId === null) {
        resizeFrameId = requestAnimationFrame(resizeRenderer);
      }
    };

    resizeRenderer();
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    const handleWebGLContextLost = (event: Event) => {
      event.preventDefault();
      console.warn('WebGL context lost detected, disabling the instruments');
      disableInstrumentLoading();
    };

    renderer.domElement.addEventListener('webglcontextlost', handleWebGLContextLost, false);

    // Load the instrument
    let instrument: THREE.Object3D;

    DracoGLTFLoader.load(
      modelPath,
      (gltf) => {
        if (disposed) return;
        instrument = gltf.scene;

        const box = new THREE.Box3().setFromObject(instrument);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const boxScale = 1 / maxDim;
        instrument.scale.set(boxScale, boxScale, boxScale);

        scene.add(instrument);

        setInstrumentLoaded(true);

        onResize();
      },
      (progress) => {},
      (error) => {
        console.error("An error occurred loading " + modelPath + ":", error)
        disableInstrumentLoading();
      }
    );

    // Set up the directional lights
    let whiteLightPositions: THREE.Vector3[] = [
      new THREE.Vector3(0, 1, 0.2),
      new THREE.Vector3(0, -1, 0.2),
      new THREE.Vector3(1, 0, 0.2),
      new THREE.Vector3(-1, 0, 0.2),
    ];

    for (let i = 0; i < whiteLightPositions.length; i++) {
      const whiteLight = new THREE.DirectionalLight(0xffffff, 0.5);
      whiteLight.position.copy(whiteLightPositions[i]);
      camera.add(whiteLight);
    }

    // White point light from center
    const pointLight = new THREE.PointLight(0xffffff, 2);
    pointLight.position.set(0, 0, 4);
    camera.add(pointLight);

    // Red directional light from above left
    const directionalLight4 = new THREE.DirectionalLight(0xff0000, 1);
    directionalLight4.position.set(-2, 2, 1);
    directionalLight4.target.position.set(1, 0, 0);
    camera.add(directionalLight4);
    camera.add(directionalLight4.target);

    scene.add(camera);

    let mouseInsideWindow = true;

    const desiredTarget = new THREE.Vector3(0, 0, camera.position.z);
    const pointerTarget = new THREE.Vector3(0, 0, camera.position.z);
    const currentTarget = new THREE.Vector3(0, 0, camera.position.z);
    let lastMousePosition = {
      clientX: window.innerWidth / 2,
      clientY: window.innerHeight / 2,
    };
    const lerpFactor = 0.05;

    const updateMouseTarget = ({ clientX, clientY }: { clientX: number; clientY: number }) => {
      const containerRect = container.getBoundingClientRect();

      // Update desired target position based on mouse position, scroll position, and container's position
      pointerTarget.x =
        ((clientX - containerRect.left) / container.clientWidth) * 2 - 1;
      pointerTarget.y =
        (-(clientY - containerRect.top) / container.clientHeight) * 2 + 1;
      pointerTarget.z = camera.position.z;

      // Store the last known mouse position
      lastMousePosition = { clientX, clientY };
    };

    const onMouseLeave = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      mouseInsideWindow = false;
    };

    const onMouseEnter = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      mouseInsideWindow = true;
    };

    const onPointerMove = (event: PointerEvent) => {
      // Touch supplies a fallback position without cancelling native scrolling.
      mouseInsideWindow = true;
      updateMouseTarget(event);
    };
    const onScroll = () => {
      updateMouseTarget(lastMousePosition);
    };

    let frames = 0;
    let lastFrameTimeStamp = performance.now();

    let framerateDropCount = 0; // Counter for framerate drops
    const dropThreshold = 30; // FPS threshold to consider it a "drop"
    const dropCheckPeriod = 10000; // Time period to check for drops, in milliseconds (e.g., 10 seconds)
    let dropCheckTimer = performance.now(); // Timer to reset the drop count
    

    // Animate the scene
    const animate = function () {
      if (disposed) return;

      const now = performance.now();
      const delta = now - lastFrameTimeStamp;
      frames++;

      if (delta >= 1000) {
        // Every second, check the frame rate
        const fps = frames / (delta / 1000);
        // Reset the frame counter
        frames = 0;
        lastFrameTimeStamp = now;
    
        // Check if FPS drops below threshold
        if (fps < dropThreshold) {
          framerateDropCount++;
        }
      }
    
      // Check if it's time to evaluate framerate drops
      if (now - dropCheckTimer >= dropCheckPeriod) {
        // If drops exceed a certain number, say 3 times in the last 10 seconds
        if (framerateDropCount > 3) {
          disableInstrumentLoading();
        }
        // Reset drop counter and timer
        framerateDropCount = 0;
        dropCheckTimer = now;
      }

      const currentTilt = getCurrentDeviceTilt(tilt.current, now);
      if (currentTilt) {
        desiredTarget.set(currentTilt.x * 0.8, currentTilt.y * 0.8, camera.position.z);
      } else if (mouseInsideWindow) {
        desiredTarget.copy(pointerTarget);
      } else {
        desiredTarget.set(0, 0, camera.position.z);
      }
      currentTarget.lerp(desiredTarget, lerpFactor);

      // Make the instrument look at the current target position
      if (instrument) {
        instrument.lookAt(currentTarget);
      }

      renderer.render(scene, camera);
      
      animationFrameIdRef.current = requestAnimationFrame(animate);
    };

    if (loadInstrumentsEnabled) {
      animate();
    }
    
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointerdown", onPointerMove, { passive: true });
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onMouseLeave, { passive: true });
    window.addEventListener("pointerenter", onMouseEnter, { passive: true });

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      if (resizeFrameId !== null) cancelAnimationFrame(resizeFrameId);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointerdown", onPointerMove);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onMouseLeave);
      window.removeEventListener("pointerenter", onMouseEnter);

      if (animationFrameIdRef.current !== null) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
      
      renderer.dispose();
      renderer.domElement.removeEventListener('webglcontextlost', handleWebGLContextLost);
      scene.clear();

      if (container && renderer.domElement) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [containerRef, modelPath, tall, loadInstrumentsEnabled, tilt]);

  useEffect(() => {
    if (!loadInstrumentsEnabled && animationFrameIdRef.current !== null) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
      setInstrumentLoaded(false);
    }
  }, [loadInstrumentsEnabled]);

  if (!loadInstrumentsEnabled) {
    return null;
  }

  return (
    <div className={`mouse-tracking-instrument-container`}>
      <div
        className={`mouse-tracking-instrument ${instrumentLoaded ? "instrument-loaded" : ""} ${tall ? "tall" : ""}`}
        ref={containerRef}
      />
    </div>
  );
};

export default MouseTrackingInstrument;
export type { MouseTrackingInstrumentProps };
