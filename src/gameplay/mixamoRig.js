// Retarget a Mixamo FBX animation onto a three-vrm humanoid skeleton.
//
// Mixamo and VRM use different bone names, rest poses and (for VRM 0.x) a
// mirrored front axis, so an FBX clip can't be played on a VRM as-is. This is
// the standard three-vrm pipeline (ported from the official
// `examples/humanoidAnimation/loadMixamoAnimation.js`): load the FBX, then for
// every track remap the Mixamo bone to its VRM humanoid bone, convert the
// rotation from the Mixamo rest pose into the VRM normalised bone's space, and
// scale hip translation by the height ratio. VRM 0.x avatars additionally need
// their X/Z mirrored.
//
// FBXLoader is pulled in here (a sizeable module) so it only loads when an
// animated VRM character is actually selected — anglerBody.js imports this file
// dynamically for that reason.

import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

// Mixamo rig bone name -> VRM humanoid bone name.
export const mixamoVRMRigMap = {
  mixamorigHips: "hips",
  mixamorigSpine: "spine",
  mixamorigSpine1: "chest",
  mixamorigSpine2: "upperChest",
  mixamorigNeck: "neck",
  mixamorigHead: "head",
  mixamorigLeftShoulder: "leftShoulder",
  mixamorigLeftArm: "leftUpperArm",
  mixamorigLeftForeArm: "leftLowerArm",
  mixamorigLeftHand: "leftHand",
  mixamorigLeftHandThumb1: "leftThumbMetacarpal",
  mixamorigLeftHandThumb2: "leftThumbProximal",
  mixamorigLeftHandThumb3: "leftThumbDistal",
  mixamorigLeftHandIndex1: "leftIndexProximal",
  mixamorigLeftHandIndex2: "leftIndexIntermediate",
  mixamorigLeftHandIndex3: "leftIndexDistal",
  mixamorigLeftHandMiddle1: "leftMiddleProximal",
  mixamorigLeftHandMiddle2: "leftMiddleIntermediate",
  mixamorigLeftHandMiddle3: "leftMiddleDistal",
  mixamorigLeftHandRing1: "leftRingProximal",
  mixamorigLeftHandRing2: "leftRingIntermediate",
  mixamorigLeftHandRing3: "leftRingDistal",
  mixamorigLeftHandPinky1: "leftLittleProximal",
  mixamorigLeftHandPinky2: "leftLittleIntermediate",
  mixamorigLeftHandPinky3: "leftLittleDistal",
  mixamorigRightShoulder: "rightShoulder",
  mixamorigRightArm: "rightUpperArm",
  mixamorigRightForeArm: "rightLowerArm",
  mixamorigRightHand: "rightHand",
  mixamorigRightHandPinky1: "rightLittleProximal",
  mixamorigRightHandPinky2: "rightLittleIntermediate",
  mixamorigRightHandPinky3: "rightLittleDistal",
  mixamorigRightHandRing1: "rightRingProximal",
  mixamorigRightHandRing2: "rightRingIntermediate",
  mixamorigRightHandRing3: "rightRingDistal",
  mixamorigRightHandMiddle1: "rightMiddleProximal",
  mixamorigRightHandMiddle2: "rightMiddleIntermediate",
  mixamorigRightHandMiddle3: "rightMiddleDistal",
  mixamorigRightHandIndex1: "rightIndexProximal",
  mixamorigRightHandIndex2: "rightIndexIntermediate",
  mixamorigRightHandIndex3: "rightIndexDistal",
  mixamorigRightHandThumb1: "rightThumbMetacarpal",
  mixamorigRightHandThumb2: "rightThumbProximal",
  mixamorigRightHandThumb3: "rightThumbDistal",
  mixamorigLeftUpLeg: "leftUpperLeg",
  mixamorigLeftLeg: "leftLowerLeg",
  mixamorigLeftFoot: "leftFoot",
  mixamorigLeftToeBase: "leftToes",
  mixamorigRightUpLeg: "rightUpperLeg",
  mixamorigRightLeg: "rightLowerLeg",
  mixamorigRightFoot: "rightFoot",
  mixamorigRightToeBase: "rightToes",
};

let fbxLoader = null;
function getFbxLoader() {
  if (!fbxLoader) fbxLoader = new FBXLoader();
  return fbxLoader;
}

/**
 * Load a Mixamo FBX animation and retarget it onto the given VRM.
 * @param {string} url FBX url (a Mixamo export).
 * @param {import("@pixiv/three-vrm").VRM} vrm Target VRM.
 * @returns {Promise<THREE.AnimationClip>} A clip playable on `vrm.scene`.
 */
export function loadMixamoAnimation(url, vrm) {
  return getFbxLoader()
    .loadAsync(url)
    .then((asset) => {
      // Mixamo names its take "mixamo.com"; fall back to whatever clip exists.
      const clip =
        THREE.AnimationClip.findByName(asset.animations, "mixamo.com") ||
        asset.animations[0];
      if (!clip) throw new Error(`No animation clip found in ${url}`);

      const tracks = [];

      const restRotationInverse = new THREE.Quaternion();
      const parentRestWorldRotation = new THREE.Quaternion();
      const _quatA = new THREE.Quaternion();

      const hipsNode = asset.getObjectByName("mixamorigHips");
      const motionHipsHeight = hipsNode ? hipsNode.position.y : 1;
      const vrmHipsHeight = vrm.humanoid?.normalizedRestPose?.hips?.position?.[1] ?? 1;
      const hipsPositionScale = motionHipsHeight ? vrmHipsHeight / motionHipsHeight : 1;
      const mirror = vrm.meta?.metaVersion === "0"; // VRM 0.x faces the opposite way

      clip.tracks.forEach((track) => {
        const [mixamoRigName, propertyName] = track.name.split(".");
        const vrmBoneName = mixamoVRMRigMap[mixamoRigName];
        const vrmNodeName = vrm.humanoid?.getNormalizedBoneNode(vrmBoneName)?.name;
        const mixamoRigNode = asset.getObjectByName(mixamoRigName);
        if (vrmNodeName == null || !mixamoRigNode) return;

        mixamoRigNode.getWorldQuaternion(restRotationInverse).invert();
        mixamoRigNode.parent.getWorldQuaternion(parentRestWorldRotation);

        if (track instanceof THREE.QuaternionKeyframeTrack) {
          for (let i = 0; i < track.values.length; i += 4) {
            const flat = track.values.slice(i, i + 4);
            _quatA.fromArray(flat);
            _quatA.premultiply(parentRestWorldRotation).multiply(restRotationInverse);
            _quatA.toArray(flat);
            for (let j = 0; j < 4; j++) track.values[i + j] = flat[j];
          }
          tracks.push(
            new THREE.QuaternionKeyframeTrack(
              `${vrmNodeName}.${propertyName}`,
              track.times,
              track.values.map((v, i) => (mirror && i % 2 === 0 ? -v : v))
            )
          );
        } else if (track instanceof THREE.VectorKeyframeTrack) {
          const values = track.values.map(
            (v, i) => (mirror && i % 3 !== 1 ? -v : v) * hipsPositionScale
          );
          tracks.push(
            new THREE.VectorKeyframeTrack(`${vrmNodeName}.${propertyName}`, track.times, values)
          );
        }
      });

      return new THREE.AnimationClip(clip.name || "vrmAnimation", clip.duration, tracks);
    });
}
