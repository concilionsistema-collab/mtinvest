import { IsIn, IsString, MinLength } from 'class-validator';
import { AnexarDocumentoInput, DocumentoDeContratoTipo } from '@crm/shared';

const TIPOS: DocumentoDeContratoTipo[] = [
  'CONTRATO_ASSINADO',
  'LAUDO_VISTORIA',
  'COMPROVANTE_GARANTIA',
  'TERMO_RENOVACAO',
  'TERMO_RESCISAO',
  'OUTRO',
];

export class AnexarDocumentoDto implements AnexarDocumentoInput {
  @IsIn(TIPOS)
  tipo!: DocumentoDeContratoTipo;

  @IsString()
  @MinLength(3)
  descricao!: string;

  // Texto livre (URL/descrição) - sem upload de arquivo real nesta fatia.
  @IsString()
  @MinLength(1)
  referencia!: string;
}
