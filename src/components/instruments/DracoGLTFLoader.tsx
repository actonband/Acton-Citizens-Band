import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath(process.env.REACT_APP_DRACO_DECODER_URI as string);

const DracoGLTFLoader = new GLTFLoader();
DracoGLTFLoader.setDRACOLoader(dracoLoader);

export { DracoGLTFLoader };