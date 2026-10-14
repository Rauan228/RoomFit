import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { PMREMGenerator } from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

/** Self-contained reflections: no external HDR service or network dependency. */
export default function StudioLighting() {
  const { gl, scene, invalidate } = useThree();
  useEffect(() => {
    const generator = new PMREMGenerator(gl);
    const studio = new RoomEnvironment();
    const target = generator.fromScene(studio, 0.055, 0.1, 100);
    const previous = scene.environment;
    scene.environment = target.texture;
    scene.environmentIntensity = 0.68;
    generator.dispose();
    studio.dispose();
    invalidate();
    return () => {
      if (scene.environment === target.texture) scene.environment = previous;
      target.dispose();
    };
  }, [gl, scene, invalidate]);
  return null;
}
