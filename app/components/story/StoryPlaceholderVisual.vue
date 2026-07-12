<template>
  <div
    class="story-placeholder-visual"
    :class="[
      `story-placeholder-visual--${presentation}`,
      `story-placeholder-visual--${state}`,
      `story-placeholder-visual--${renderModel.placeholder.motif}`,
    ]"
    :data-placeholder-layout="renderModel.placeholder.layout"
    :data-placeholder-variant="renderModel.placeholder.variant"
    :data-placeholder-version="renderModel.placeholder.version"
    :style="renderModel.placeholder.style"
    aria-hidden="true"
  >
    <div class="story-placeholder-page">
      <div class="story-placeholder-chrome">
        <span class="story-placeholder-badge">{{ renderModel.placeholder.initials }}</span>
      </div>
      <svg
        class="story-placeholder-scene"
        :viewBox.attr="renderModel.viewBox"
        preserveAspectRatio="xMidYMid meet"
        focusable="false"
      >
        <template v-for="primitive in renderModel.primitives" :key="primitive.key">
          <circle
            v-if="primitive.shape === 'circle'"
            :class="primitive.className"
            :cx.attr="primitive.circle.cx"
            :cy.attr="primitive.circle.cy"
            :r.attr="primitive.circle.r"
            :opacity.attr="primitive.opacity"
          />
          <line
            v-else-if="primitive.shape === 'line'"
            :class="primitive.className"
            :x1.attr="primitive.line.x1"
            :x2.attr="primitive.line.x2"
            :y1.attr="primitive.line.y"
            :y2.attr="primitive.line.y"
            :opacity.attr="primitive.opacity"
            :stroke-width.attr="primitive.line.strokeWidth"
          />
          <rect
            v-else
            :class="primitive.className"
            :x.attr="primitive.rect.x"
            :y.attr="primitive.rect.y"
            :width.attr="primitive.rect.width"
            :height.attr="primitive.rect.height"
            :rx.attr="primitive.rect.radius"
            :opacity.attr="primitive.opacity"
          />
        </template>
      </svg>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  buildStoryPlaceholder,
  type StoryPlaceholderPrimitive,
} from '~/composables/useStoryPlaceholder'

type PlaceholderPresentation = 'card' | 'compact' | 'detail'
type PlaceholderState = 'failed' | 'loaded' | 'loading' | 'queued'

const props = withDefaults(defineProps<{
  domain: string
  presentation?: PlaceholderPresentation
  seed: string
  state?: PlaceholderState
}>(), {
  presentation: 'card',
  state: 'loading',
})

const PRESENTATION_WIDTHS: Record<PlaceholderPresentation, number> = {
  card: 1360,
  compact: 2000,
  detail: 1590,
}

const RADIUS_VALUES = {
  sm: 18,
  md: 34,
  lg: 62,
  pill: 999,
} as const

const renderPrimitive = (primitive: StoryPlaceholderPrimitive, canvasWidth: number) => {
  const scaleX = (value: number) => Math.round(value * canvasWidth) / 1000
  const x = scaleX(primitive.rect.x)
  const y = primitive.rect.y
  const width = scaleX(primitive.rect.width)
  const height = primitive.rect.height
  const circleDiameter = Math.min(width, height)
  const radius = primitive.radius === 'pill'
    ? Math.min(width, height) / 2
    : RADIUS_VALUES[primitive.radius]

  return {
    key: primitive.key,
    shape: primitive.shape,
    opacity: primitive.opacity / 100,
    className: [
      'story-placeholder-primitive',
      `story-placeholder-primitive--${primitive.shape}`,
      `story-placeholder-primitive--${primitive.tone}`,
    ],
    circle: {
      cx: x + width / 2,
      cy: y + height / 2,
      r: circleDiameter / 2,
    },
    line: {
      x1: x,
      x2: x + width,
      y: y + height / 2,
      strokeWidth: height,
    },
    rect: {
      x,
      y,
      width,
      height,
      radius,
    },
  }
}

const renderModel = computed(() => {
  const placeholder = buildStoryPlaceholder(props.domain, props.seed)
  const canvasWidth = PRESENTATION_WIDTHS[props.presentation]

  return {
    placeholder,
    primitives: placeholder.primitives.map((primitive) => renderPrimitive(primitive, canvasWidth)),
    viewBox: `0 0 ${canvasWidth} 1000`,
  }
})
</script>

<style scoped>
.story-placeholder-visual {
  --wire-canvas: color-mix(in oklch, var(--seed-surface-raised) 88%, var(--seed-accent-soft));
  --wire-panel: color-mix(in oklch, var(--seed-surface-raised) 72%, var(--seed-accent) 28%);
  --wire-panel-muted: color-mix(in oklch, var(--seed-surface) 84%, var(--seed-accent) 16%);
  --wire-stroke: color-mix(in oklch, var(--seed-border-strong) 88%, var(--seed-accent) 12%);
  --wire-ink: color-mix(in oklch, var(--seed-accent) 82%, var(--seed-border-strong));
  --wire-focus: color-mix(in oklch, var(--seed-surface-raised) 62%, var(--seed-accent) 38%);
  position: absolute;
  inset: 0;
  overflow: hidden;
  contain: layout paint;
  pointer-events: none;
  background:
    radial-gradient(circle at var(--wire-glow-x) var(--wire-glow-y), var(--seed-ring), transparent 42%),
    linear-gradient(155deg, var(--seed-surface-strong), var(--seed-overlay-mid) 56%, var(--seed-overlay-edge));
}

.story-placeholder-visual--loaded {
  visibility: hidden;
  opacity: 0;
}

.story-placeholder-visual::before {
  position: absolute;
  inset: -12%;
  content: '';
  pointer-events: none;
  opacity: 0;
}

.story-placeholder-visual--grid::before {
  background-image:
    linear-gradient(color-mix(in oklch, var(--seed-border) 46%, transparent) 1px, transparent 1px),
    linear-gradient(90deg, color-mix(in oklch, var(--seed-border) 40%, transparent) 1px, transparent 1px);
  background-size: var(--wire-grid-size) var(--wire-grid-size);
  opacity: 0.28;
}

.story-placeholder-visual--bands::before {
  background-image: repeating-linear-gradient(
    135deg,
    transparent 0 34px,
    color-mix(in oklch, var(--seed-border) 42%, transparent) 34px 35px
  );
  opacity: 0.22;
}

.story-placeholder-visual--glow::before {
  background: radial-gradient(
    circle at var(--wire-glow-x) var(--wire-glow-y),
    color-mix(in oklch, var(--seed-accent-soft) 84%, transparent),
    transparent 38%
  );
  opacity: 0.8;
}

.story-placeholder-page {
  position: absolute;
  inset: 8%;
  overflow: hidden;
  border: 1px solid var(--wire-stroke);
  border-radius: var(--wire-frame-radius);
  background: var(--wire-canvas);
  box-shadow:
    0 24px 52px -34px var(--seed-shadow-strong),
    inset 0 1px 0 color-mix(in oklch, var(--seed-highlight) 88%, transparent);
  opacity: 1;
}

.story-placeholder-visual--card .story-placeholder-page {
  inset: calc(var(--story-card-topbar-height, 2.75rem) + 0.7rem) 0.85rem 0.75rem;
}

.story-placeholder-visual--compact .story-placeholder-page {
  inset: 8% 6%;
}

.story-placeholder-visual--detail .story-placeholder-page {
  inset: 5%;
}

.story-placeholder-chrome {
  position: absolute;
  inset: 0 0 auto;
  z-index: 2;
  height: 16%;
  border-bottom: 1px solid var(--wire-stroke);
  background: color-mix(in oklch, var(--seed-surface-raised) 72%, transparent);
}

.story-placeholder-chrome::before,
.story-placeholder-chrome::after {
  position: absolute;
  top: 50%;
  height: 2px;
  border-radius: 999px;
  content: '';
  transform: translateY(-50%);
}

.story-placeholder-chrome::before {
  right: 17%;
  width: 18%;
  background: color-mix(in oklch, var(--seed-border-strong) 62%, transparent);
}

.story-placeholder-chrome::after {
  right: 5%;
  width: 8%;
  background: color-mix(in oklch, var(--seed-accent) 54%, transparent);
}

.story-placeholder-badge {
  position: absolute;
  top: 50%;
  left: 4.5%;
  display: inline-flex;
  min-width: 1.6rem;
  height: 1.6rem;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in oklch, var(--seed-border-strong) 68%, transparent);
  border-radius: 0.48rem;
  background: var(--wire-focus);
  color: var(--seed-accent-strong);
  font-family: var(--font-display);
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1;
  transform: translateY(-50%);
}

.story-placeholder-scene {
  position: absolute;
  inset: 19% 4% 4%;
  display: block;
  width: 92%;
  height: 77%;
  overflow: visible;
}

.story-placeholder-primitive {
  stroke: var(--wire-stroke);
  vector-effect: non-scaling-stroke;
}

.story-placeholder-primitive--circle,
.story-placeholder-primitive--rect {
  stroke-width: 1.1;
}

.story-placeholder-primitive--raised {
  fill: var(--wire-panel);
}

.story-placeholder-primitive--surface {
  fill: var(--wire-panel-muted);
}

.story-placeholder-primitive--accent-soft {
  fill: var(--wire-focus);
  stroke: color-mix(in oklch, var(--seed-border-strong) 70%, transparent);
}

.story-placeholder-primitive--accent {
  fill: var(--wire-ink);
  stroke: var(--wire-ink);
}

.story-placeholder-primitive--line {
  fill: none;
  stroke-linecap: round;
  vector-effect: none;
}

.story-placeholder-primitive--line.story-placeholder-primitive--surface,
.story-placeholder-primitive--line.story-placeholder-primitive--raised {
  stroke: color-mix(in oklch, var(--seed-border-strong) 64%, transparent);
}

.story-placeholder-primitive--line.story-placeholder-primitive--accent-soft {
  stroke: color-mix(in oklch, var(--seed-accent) 72%, transparent);
}
</style>
