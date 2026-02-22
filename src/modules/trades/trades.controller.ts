import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { TradesService } from './trades.service';
import { CreateTradeDto } from './dto/create-trade.dto';
import { UpdateTradeDto } from './dto/update-trade.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { IsString, MaxLength } from 'class-validator';

class AddSubcategoryDto {
  @IsString()
  @MaxLength(100)
  name: string;
}

@Controller('trades')
export class TradesController {
  constructor(private readonly tradesService: TradesService) {}

  @Get()
  findAll() {
    return this.tradesService.findAll();
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.tradesService.findById(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateTradeDto) {
    return this.tradesService.create(dto.name);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateTradeDto) {
    return this.tradesService.update(id, dto.name);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  delete(@Param('id') id: string) {
    return this.tradesService.delete(id);
  }

  @Post(':id/subcategories')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  addSubcategory(
    @Param('id') id: string,
    @Body() dto: AddSubcategoryDto,
  ) {
    return this.tradesService.addSubcategory(id, dto.name);
  }

  @Delete(':id/subcategories/:slug')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  removeSubcategory(
    @Param('id') id: string,
    @Param('slug') slug: string,
  ) {
    return this.tradesService.removeSubcategory(id, slug);
  }
}
