import React, { useEffect, useState, useRef } from "react";
import * as THREE from "three";
import { DracoGLTFLoader } from "./DracoGLTFLoader";
import { useInstrumentLoading } from './InstrumentLoadingContext';

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
    camera.position.z = 1;

    const renderer = new THREE.WebGLRenderer({ alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    // Handle window resizing
    const onResize = () => {
      // Update size of renderer
      camera.aspect = container.clientWidth / container.clientHeight;
      renderer.setSize(container.clientWidth, container.clientHeight);

      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";

      camera.updateProjectionMatrix();
    };

    onResize();

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
        instrument = gltf.scene;

        const box = new THREE.Box3().setFromObject(instrument);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const boxScale = 1 / maxDim;
        instrument.scale.set(boxScale, boxScale, boxScale);

        scene.add(instrument);

        animate();

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
    const currentTarget = new THREE.Vector3(0, 0, camera.position.z);
    let lastMousePosition = {
      clientX: 0,
      clientY: 0,
    };
    const lerpFactor = 0.05;

    const updateInstrumentRotation = (event: MouseEvent | TouchEvent | Event) => {
      let clientX: number, clientY: number;

      if (event instanceof MouseEvent) {
        clientX = event.clientX;
        clientY = event.clientY;
      } else if (event instanceof TouchEvent && event.touches.length > 0) {
        clientX = event.touches[0].clientX;
        clientY = event.touches[0].clientY;
      } else {
        // Use the last known mouse position if the event is not recognized
        // This branch might not be needed, but it's here for completeness
        clientX = lastMousePosition.clientX;
        clientY = lastMousePosition.clientY;
      }

      const containerRect = container.getBoundingClientRect();

      // Update desired target position based on mouse position, scroll position, and container's position
      desiredTarget.x =
        ((clientX - containerRect.left) / container.clientWidth) * 2 - 1;
      desiredTarget.y =
        (-(clientY - containerRect.top) / container.clientHeight) * 2 + 1;
      desiredTarget.z = camera.position.z;

      // Store the last known mouse position
      lastMousePosition = { clientX, clientY };
    };

    const onMouseLeave = () => {
      mouseInsideWindow = false;
    };

    const onMouseEnter = () => {
      mouseInsideWindow = true;
    };

    const handleTouch = (event: TouchEvent) => {

      const canvasBoundingRect = renderer.domElement.getBoundingClientRect();

      // Canvas width is set to 300% width in CSS
      const actualCanvasWidth = canvasBoundingRect.width / 3;
      const actualCanvasLeft = canvasBoundingRect.left + (actualCanvasWidth);
      const actualCanvasRight = canvasBoundingRect.right - (actualCanvasWidth);

      // Avoid unintentional touches by reducing the touch area by 1/5
      const fifthWidth = actualCanvasWidth / 5;
      const fifthHeight = canvasBoundingRect.height / 5;
      const adjustedCanvasLeft = actualCanvasLeft + fifthWidth;
      const adjustedCanvasRight = actualCanvasRight - fifthWidth;
      const adjustedCanvasTop = canvasBoundingRect.top + fifthHeight;
      const adjustedCanvasBottom = canvasBoundingRect.bottom - fifthHeight;

      const touch = event.touches[0];

      if (touch.clientX >= adjustedCanvasLeft &&
          touch.clientX <= adjustedCanvasRight  &&
          touch.clientY >= adjustedCanvasTop  &&
          touch.clientY <= adjustedCanvasBottom) {
        
        // Touch started inside the component
        updateInstrumentRotation(event);
        // Prevent scrolling and zooming
        event.preventDefault(); 
      }
    }

    let frames = 0;
    let lastFrameTimeStamp = performance.now();

    let framerateDropCount = 0; // Counter for framerate drops
    const dropThreshold = 30; // FPS threshold to consider it a "drop"
    const dropCheckPeriod = 10000; // Time period to check for drops, in milliseconds (e.g., 10 seconds)
    let dropCheckTimer = performance.now(); // Timer to reset the drop count
    

    // Animate the scene
    const animate = function () {

      if (!loadInstrumentsEnabled) {
        renderer.clear();
        return;
      }

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

      // Smoothly update the current target position based on the desired target position when the mouse is inside the window
      if (mouseInsideWindow) {
        currentTarget.lerp(desiredTarget, lerpFactor);
      } else {
        currentTarget.lerp(
          currentTarget.clone().set(0, 0, camera.position.z),
          lerpFactor
        );
      }

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
    window.addEventListener("scroll", updateInstrumentRotation);
    window.addEventListener("touchstart", handleTouch, {passive: false});
    window.addEventListener("touchmove", handleTouch);
    window.addEventListener("mousemove", updateInstrumentRotation);
    window.addEventListener("mouseleave", onMouseLeave);
    window.addEventListener("mouseenter", onMouseEnter);

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", updateInstrumentRotation);
      window.removeEventListener("touchstart", handleTouch);
      window.removeEventListener("touchmove", handleTouch);
      window.removeEventListener("mousemove", updateInstrumentRotation);
      window.removeEventListener("mouseleave", onMouseLeave);
      window.removeEventListener("mouseenter", onMouseEnter);

      if (animationFrameIdRef.current !== null) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
      
      renderer.dispose();
      scene.clear();

      if (container && renderer.domElement) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [containerRef, modelPath, loadInstrumentsEnabled]);

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
