// Test script to verify Line transform behavior

// Mock the RenderObject base class for testing
class RenderObject {
    constructor(x = 0, y = 0, scaleX = 1, scaleY = 1, opacity = 1) {
        this.x = x;
        this.y = y;
        this.scaleX = scaleX;
        this.scaleY = scaleY;
        this.opacity = opacity;
        this.visible = true;
        this.rotation = 0;
    }

    setPosition(x, y) {
        this.x = x;
        this.y = y;
        return this;
    }
}

// Copy the Line class implementation for testing
class Line extends RenderObject {
    constructor(x1, y1, x2, y2, color = '#FFFFFF', lineWidth = 1) {
        super(x1, y1);
        // Store relative vector from start to end point
        this.deltaX = x2 - x1;
        this.deltaY = y2 - y1;
        this.color = color;
        this.lineWidth = lineWidth;
        this.lineCap = 'butt'; // 'butt', 'round', 'square'
        this.lineDash = []; // For dashed lines
    }

    setEndPoint(x2, y2) {
        this.deltaX = x2 - this.x;
        this.deltaY = y2 - this.y;
        return this;
    }

    getEndPoint() {
        return {
            x: this.x + this.deltaX,
            y: this.y + this.deltaY
        };
    }

    setDelta(deltaX, deltaY) {
        this.deltaX = deltaX;
        this.deltaY = deltaY;
        return this;
    }

    getDelta() {
        return {
            x: this.deltaX,
            y: this.deltaY
        };
    }

    getBounds() {
        const x2 = this.x + this.deltaX;
        const y2 = this.y + this.deltaY;
        return {
            x: Math.min(this.x, x2),
            y: Math.min(this.y, y2),
            width: Math.abs(this.deltaX),
            height: Math.abs(this.deltaY)
        };
    }

    // Static helper methods for common line types
    static createVerticalLine(x, y1, y2, color = '#FFFFFF', lineWidth = 1) {
        return new Line(x, y1, x, y2, color, lineWidth);
    }

    static createHorizontalLine(x1, x2, y, color = '#FFFFFF', lineWidth = 1) {
        return new Line(x1, y, x2, y, color, lineWidth);
    }
}

// Test 1: Basic line creation
console.log('Test 1: Basic line creation');
const line1 = new Line(10, 10, 20, 30);
console.log('Start:', line1.x, line1.y);
console.log('Delta:', line1.deltaX, line1.deltaY);
console.log('End:', line1.getEndPoint());
console.log('Bounds:', line1.getBounds());

// Test 2: Position change (this was the bug!)
console.log('\nTest 2: Position change');
line1.setPosition(50, 60);
console.log('New start:', line1.x, line1.y);
console.log('Delta (should be unchanged):', line1.deltaX, line1.deltaY);
console.log('New end:', line1.getEndPoint());
console.log('New bounds:', line1.getBounds());

// Test 3: End point change
console.log('\nTest 3: End point change');
line1.setEndPoint(100, 120);
console.log('Start:', line1.x, line1.y);
console.log('New delta:', line1.deltaX, line1.deltaY);
console.log('End:', line1.getEndPoint());

// Test 4: Static helper methods
console.log('\nTest 4: Static helper methods');
const vLine = Line.createVerticalLine(30, 10, 50);
console.log('Vertical line delta:', vLine.deltaX, vLine.deltaY); // Should be (0, 40)

const hLine = Line.createHorizontalLine(10, 50, 30);
console.log('Horizontal line delta:', hLine.deltaX, hLine.deltaY); // Should be (40, 0)
