import {
  Vec2,
  constrainAngle,
  fromAngle,
  heading,
  scale,
  sub,
} from "@/lib/math";

export class Chain {
  joints: Vec2[] = [];
  angles: number[] = [];
  linkSize: number;
  angleConstraint: number;

  constructor(
    origin: Vec2,
    jointCount: number,
    linkSize: number,
    angleConstraint = Math.PI * 2,
  ) {
    this.linkSize = linkSize;
    this.angleConstraint = angleConstraint;
    this.joints.push({ ...origin });
    this.angles.push(0);
    for (let i = 1; i < jointCount; i++) {
      this.joints.push({ x: origin.x, y: origin.y + linkSize * i });
      this.angles.push(0);
    }
  }

  resolve(pos: Vec2): void {
    this.angles[0] = heading(sub(pos, this.joints[0]));
    this.joints[0] = { ...pos };
    for (let i = 1; i < this.joints.length; i++) {
      const curAngle = heading(sub(this.joints[i - 1], this.joints[i]));
      this.angles[i] = constrainAngle(
        curAngle,
        this.angles[i - 1],
        this.angleConstraint,
      );
      this.joints[i] = sub(
        this.joints[i - 1],
        scale(fromAngle(this.angles[i]), this.linkSize),
      );
    }
  }
}
