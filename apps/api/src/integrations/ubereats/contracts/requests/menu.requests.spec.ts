import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PublishUberMenuDto } from './menu.requests';

describe('Uber Eats menu request contracts', () => {
  it('rejects duplicate or oversized menu exclusions', () => {
    const dto = plainToInstance(PublishUberMenuDto, {
      excludedCategoryIds: ['a', 'a'],
    });
    expect(validateSync(dto)).not.toHaveLength(0);
  });
});
