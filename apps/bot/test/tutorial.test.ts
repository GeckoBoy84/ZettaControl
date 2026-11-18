import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderTutorialStep, TUTORIAL_STEPS } from '../src/views/tutorial.ts';

describe('tutorial', () => {
	it('renders every step with its image attached', () => {
		TUTORIAL_STEPS.forEach((step, index) => {
			const { embeds, files } = renderTutorialStep(index);
			const image = embeds[0]?.toJSON().image?.url;
			assert.equal(image, step.image ? `attachment://${step.image}` : undefined);
			assert.equal(files.length, step.image ? 1 : 0);
		});
	});

	it('keeps steps within Discord limits', () => {
		TUTORIAL_STEPS.forEach((_, index) => {
			const { embeds, components } = renderTutorialStep(index);
			assert.ok((embeds[0]?.toJSON().description?.length ?? 0) <= 4_096);
			for (const row of components) assert.ok(row.components.length <= 5);
		});
	});

	it('clamps out of range steps', () => {
		assert.equal(renderTutorialStep(-1).embeds[0]?.toJSON().title, TUTORIAL_STEPS[0]?.title);
		assert.equal(renderTutorialStep(99).embeds[0]?.toJSON().title, TUTORIAL_STEPS.at(-1)?.title);
	});
});
