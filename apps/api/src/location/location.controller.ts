import { Body, Controller, Post } from '@nestjs/common';
import { LocationService, Coordinates } from './location.service';

interface GeocodeRequestBody {
  address?: string;
  cityHint?: string;
}

@Controller('location')
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @Post('geocode')
  async geocode(
    @Body() body: GeocodeRequestBody | null | undefined,
  ): Promise<Coordinates | null> {
    const address = body?.address;
    const cityHint = body?.cityHint;

    return this.locationService.geocode(address, cityHint);
  }
}
