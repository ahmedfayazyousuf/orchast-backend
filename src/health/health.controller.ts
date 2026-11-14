import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@nestjs/authentication';

@ApiTags('Health')
@Controller()
export class HealthController {
  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Liveness check' })
  @ApiOkResponse({
    description: 'The process is up. This does not call Supabase.',
  })
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
