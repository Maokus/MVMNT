const outsideHost = (name) => {
    throw new Error(`${name} is host-provided and can only be constructed inside MVMNT`);
};
export class RenderObject {
    constructor() {
        outsideHost('RenderObject');
    }
}
export class Rectangle {
    constructor() {
        outsideHost('Rectangle');
    }
}
export class Text {
    constructor() {
        outsideHost('Text');
    }
}
export class Line {
    constructor() {
        outsideHost('Line');
    }
}
export class Arc {
    constructor() {
        outsideHost('Arc');
    }
}
export class BoxRenderObject {
    constructor() {
        outsideHost('BoxRenderObject');
    }
}
export class EmptyRenderObject {
    constructor() {
        outsideHost('EmptyRenderObject');
    }
}
export class Poly {
    constructor() {
        outsideHost('Poly');
    }
}
export class BezierPath {
    constructor() {
        outsideHost('BezierPath');
    }
}
export class GlowLayer {
    constructor() {
        outsideHost('GlowLayer');
    }
}
export class CompositeLayer {
    constructor() {
        outsideHost('CompositeLayer');
    }
}
export class ClipLayer {
    constructor() {
        outsideHost('ClipLayer');
    }
}
export class VisualMedia {
    constructor() {
        outsideHost('VisualMedia');
    }
}
export class PixelGrid {
    constructor() {
        outsideHost('PixelGrid');
    }
}
