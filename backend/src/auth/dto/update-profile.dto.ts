import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// Name only. The email is the login and is deliberately not editable here: a
// stolen token must not be enough to repoint an account (and its password
// resets) at someone else's inbox.
export class UpdateProfileDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(80) firstName!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(80) lastName!: string;
}
