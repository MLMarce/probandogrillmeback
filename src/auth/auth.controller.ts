import { Body, Controller, Get, Headers, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { LoginResponse, SessionUser } from './auth.types';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login de Administrador de RRHH' })
  @ApiOkResponse({ type: LoginResponse })
  login(@Body() dto: LoginDto): Promise<LoginResponse> {
    return this.auth.login(dto.email, dto.password);
  }

  @Post('logout')
  @HttpCode(200)
  @ApiBearerAuth()
  logout(@Headers('authorization') authorization?: string): Promise<void> {
    return this.auth.logout(this.extractToken(authorization));
  }

  @Get('session')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Devuelve el usuario de la sesión actual' })
  @ApiOkResponse({ type: SessionUser })
  session(@Headers('authorization') authorization?: string): Promise<SessionUser> {
    return this.auth.session(this.extractToken(authorization));
  }

  @Post('reset-password')
  @HttpCode(202)
  @ApiOperation({ summary: 'Envía el link mágico de recuperación de contraseña' })
  resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    return this.auth.resetPassword(dto.email);
  }

  private extractToken(authorization?: string): string {
    const match = authorization?.match(/^Bearer (.+)$/);
    if (!match) throw new UnauthorizedException('Falta el header Authorization Bearer');
    return match[1];
  }
}
