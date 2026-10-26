import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath(
  process.env.REACT_APP_DRACO_DECODER_URI ||
    "https://www.gstatic.com/draco/versioned/decoders/1.5.6/",
);

const DracoGLTFLoader = new GLTFLoader();
DracoGLTFLoader.setDRACOLoader(dracoLoader);

export { DracoGLTFLoader };
