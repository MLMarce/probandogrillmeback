import { UnprocessableEntityException } from '@nestjs/common';

export interface CsvParsed {
  headers: string[];
  filas: string[][];
}

/**
 * Parser CSV RFC 4180 (comillas, comillas escapadas "", CR/LF/CRLF).
 * Lanza 422 ante comillas sin cerrar.
 */
export function parseCsv(texto: string): CsvParsed {
  const limpio = texto.replace(/^\uFEFF/, '');
  const rows = parseRows(limpio);
  const [headers, ...filas] = rows;
  return { headers: headers ?? [], filas };
}

function parseRows(texto: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let campo = '';
  let dentroDeComillas = false;
  let i = 0;

  const finCampo = () => {
    row.push(campo);
    campo = '';
  };
  const finFila = () => {
    finCampo();
    rows.push(row);
    row = [];
  };

  while (i < texto.length) {
    const c = texto[i];
    if (dentroDeComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i += 2;
          continue;
        }
        dentroDeComillas = false;
        i += 1;
        continue;
      }
      campo += c;
      i += 1;
      continue;
    }
    if (c === '"' && campo === '') {
      dentroDeComillas = true;
      i += 1;
      continue;
    }
    if (c === ',') {
      finCampo();
      i += 1;
      continue;
    }
    if (c === '\r') {
      i += texto[i + 1] === '\n' ? 2 : 1;
      finFila();
      continue;
    }
    if (c === '\n') {
      finFila();
      i += 1;
      continue;
    }
    campo += c;
    i += 1;
  }

  if (dentroDeComillas) {
    throw new UnprocessableEntityException('CSV malformado: comillas sin cerrar');
  }
  if (campo !== '' || row.length > 0) {
    finFila();
  }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}
