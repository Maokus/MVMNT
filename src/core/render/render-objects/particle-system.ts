import { RenderObject, RenderConfig } from './base';

export interface ParticleInstance {
    x: number;
    y: number;
    size: number;
    color: string;
    opacity: number;
    rotation?: number;
}

export class ParticleSystem extends RenderObject {
    private readonly particles: ParticleInstance[] = [];

    addParticle(particle: ParticleInstance): this {
        this.particles.push({ ...particle });
        return this;
    }

    clearParticles(): this {
        this.particles.length = 0;
        return this;
    }

    getParticles(): readonly ParticleInstance[] {
        return this.particles;
    }

    protected _renderSelf(ctx: CanvasRenderingContext2D, _config: RenderConfig, _time: number): void {
        for (const particle of this.particles) {
            if (particle.opacity <= 0 || particle.size <= 0) continue;
            ctx.save();
            ctx.globalAlpha *= particle.opacity;
            ctx.translate(particle.x, particle.y);
            if (particle.rotation) ctx.rotate(particle.rotation);
            const radius = particle.size / 2;
            ctx.fillStyle = particle.color;
            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }
}
