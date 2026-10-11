import { ApiProperty } from '@nestjs/swagger';

export class LoginResponse {
  @ApiProperty()
  access_token!: string;

  @ApiProperty()
  token_type!: string;

  @ApiProperty({ type: 'object', properties: { id: { type: 'string' }, email: { type: 'string' } } })
  user!: { id: string; email?: string };
}

export class SessionUser {
  @ApiProperty()
  id!: string;

  @ApiProperty({ required: false })
  email?: string;
}
