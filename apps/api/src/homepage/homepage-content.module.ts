import { Module } from '@nestjs/common';
import { HomepageContentController } from './homepage-content.controller';
import { HomepageContentService } from './homepage-content.service';

@Module({
  controllers: [HomepageContentController],
  providers: [HomepageContentService],
  exports: [HomepageContentService],
})
export class HomepageContentModule {}
