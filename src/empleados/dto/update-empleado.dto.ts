import { PartialType } from '@nestjs/swagger';
import { CreateEmpleadoDto } from './create-empleado.dto';

/**
 * Edición de un Empleado. String vacío ("") limpia areaId/supervisorId.
 * `estado` no se edita acá: su ciclo de vida (baja lógica/reactivación) vive en su propio endpoint.
 */
export class UpdateEmpleadoDto extends PartialType(CreateEmpleadoDto) {}
