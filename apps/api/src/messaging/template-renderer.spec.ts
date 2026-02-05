import { renderTemplateString } from './template-renderer';

describe('renderTemplateString', () => {
  it('renders content inside if block when value exists', () => {
    const template = '礼包：{{giftName}}{{#if giftValue}}（价值: {{giftValue}}）{{/if}}';
    const result = renderTemplateString(template, {
      giftName: '欢迎礼包',
      giftValue: '38',
    });

    expect(result).toBe('礼包：欢迎礼包（价值: 38）');
  });

  it('omits content inside if block when value is missing', () => {
    const template = '礼包：{{giftName}}{{#if giftValue}}（价值: {{giftValue}}）{{/if}}';
    const result = renderTemplateString(template, {
      giftName: '欢迎礼包',
      giftValue: '',
    });

    expect(result).toBe('礼包：欢迎礼包');
  });

  it('supports dot-path variable in if condition', () => {
    const template = '{{#if gift.value}}Value: {{gift.value}}{{/if}}';
    const result = renderTemplateString(template, {
      gift: { value: '42' },
    });

    expect(result).toBe('Value: 42');
  });
});
