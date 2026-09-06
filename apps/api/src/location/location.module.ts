import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { LocationController } from './location.controller';
import { LOCATION_GEOCODER } from './location-geocoding.contract';
import { LocationService } from './location.service';

@Module({
  imports: [HttpModule],
  controllers: [LocationController],
  providers: [
    LocationService,
    {
      provide: LOCATION_GEOCODER,
      useExisting: LocationService,
    },
  ],
  exports: [LOCATION_GEOCODER],
})
export class LocationModule {}
