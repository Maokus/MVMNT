// Easing functions for smooth animations

export const Easing = {
    easeInOutQuad: (t) => {
        return t < 0.5
            ? 2 * t * t
            : -1 + (4 - 2 * t) * t;
    },
    easeInOut: (t) => {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    },
    easeIn: (t) => {
        return t * t;
    },
    easeOut: (t) => {
        return t * (2 - t);
    }
};
