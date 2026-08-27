import { useState } from 'react';
import type { Sesion, RegistroRow, Empleado, Sala, Capacitador } from '../../types/domain';
import { computeModalidad, esValorUtil } from '../../lib/conflictEngine';
import { FilterCombo } from '../../components/shared/FilterCombo';

interface Attendee { id?: number; nombre: string; codigo: number | null; unidad: string | null; localidad?: string | null; }

interface Props {
  sessionId: string | 'new';
  session: Sesion | null;
  registro: RegistroRow[];
  empleados: Empleado[];
  salas: Sala[];
  capacitadoresDisponibles: Capacitador[];
  /** Opciones para los desplegables del formulario, sacadas de los datos reales */
  modulosDisponibles: string[];
  localidadesDisponibles: string[];
  requisitosDisponibles: string[];
  canEdit: boolean;
  defaultFecha: string;
  onClose: () => void;
  onSave: (fields: Record<string, string | null>, attendees: Attendee[]) => Promise<boolean>;
  onDeleteSession: () => Promise<boolean>;
}

export function SessionModal({ sessionId, session, empleados, salas, capacitadoresDisponibles, modulosDisponibles, localidadesDisponibles, requisitosDisponibles, canEdit, defaultFecha, onClose, onSave, onDeleteSession }: Props) {
  const isNew = sessionId === 'new';
  const readOnly = !canEdit;
  const base = session || {
    capacitador: '', modulo: '', tema: '', fecha: defaultFecha, hora: '08:00', horaFin: '10:00',
    localidad: '', lugar: '', modalidad: 'PRESENCIAL', sala: 'POR CONFIRMAR', estado: 'POR CONFIRMAR',
    requisitos: '', observaciones: '', attendees: [],
  } as unknown as Sesion;

  // Los capacitadores se guardan en un solo campo separados por " / " (así viene
  // del Excel original). Aquí se manejan como lista para poder agregar y quitar
  // uno por uno, y al guardar se vuelven a unir con ese mismo separador.
  const [capacitadores, setCapacitadores] = useState<string[]>(
    (base.capacitador || '').split('/').map(s => s.trim()).filter(Boolean)
  );
  const [addCap, setAddCap] = useState('');
  const [modulo, setModulo] = useState(base.modulo || '');
  const [tema, setTema] = useState(base.tema || '');
  const [fecha, setFecha] = useState(base.fecha || defaultFecha);
  const [hora, setHora] = useState(base.hora || '');
  const [horaFin, setHoraFin] = useState(base.horaFin || '');
  const [localidad, setLocalidad] = useState(base.localidad || '');
  const [lugar, setLugar] = useState(base.lugar || '');
  const [modalidad, setModalidad] = useState(base.modalidad || 'PRESENCIAL');
  const [sala, setSala] = useState(base.sala || 'POR CONFIRMAR');
  const [estado, setEstado] = useState(base.estado || 'POR CONFIRMAR');
  /* Los requisitos se guardan en un solo campo separados por " / " (igual que los
     capacitadores). Aquí se manejan como lista para poder elegir varios. */
  const [requisitosList, setRequisitosList] = useState<string[]>(
    // Se descartan los "NA", "NINGUNO", etc. que traen los datos viejos: como
    // ficha no aportan nada y ensucian el formulario.
    (base.requisitos || '').split('/').map(s => s.trim()).filter(esValorUtil)
  );
  const [addReq, setAddReq] = useState('');
  const [observaciones, setObservaciones] = useState(base.observaciones || '');
  const [attendees, setAttendees] = useState<Attendee[]>(
    (session?.attendees || []).map(a => ({ id: a.id, nombre: a.nombre || '', codigo: a.codigo, unidad: a.unidad, localidad: a.localidad }))
  );
  const [addName, setAddName] = useState('');
  const [saving, setSaving] = useState(false);

  /* Modalidad resultante de la reunión, recalculada en vivo mientras se edita:
     capacitador + todos los participantes. Si hay mezcla -> HÍBRIDA. */
  const modalidadReunion = computeModalidad(
    attendees.map(a => ({ id: a.id ?? 0, nombre: a.nombre, codigo: a.codigo, unidad: a.unidad, localidad: a.localidad ?? null, modalidad: (a as { modalidad?: string | null }).modalidad ?? modalidad })),
    modalidad
  );

  function addRequisito(v?: string) {
    const val = (v ?? addReq).trim().toUpperCase();
    if (!esValorUtil(val)) { setAddReq(''); return; }
    if (requisitosList.some(x => x.toUpperCase() === val)) { setAddReq(''); return; }
    setRequisitosList(prev => [...prev, val]);
    setAddReq('');
  }
  function removeRequisito(i: number) {
    setRequisitosList(prev => prev.filter((_, idx) => idx !== i));
  }

  function addCapacitador(nombre?: string) {
    const val = (nombre ?? addCap).trim().toUpperCase();
    if (!val) return;
    // Sin duplicados: si ya está en la lista no se agrega otra vez.
    if (capacitadores.some(x => x.toUpperCase() === val)) { setAddCap(''); return; }
    setCapacitadores(prev => [...prev, val]);
    setAddCap('');
  }
  function removeCapacitador(i: number) {
    setCapacitadores(prev => prev.filter((_, idx) => idx !== i));
  }

  function addAttendee() {
    const val = addName.trim();
    if (!val) return;
    const found = empleados.find(e => e.nombre.toUpperCase() === val.toUpperCase());
    setAttendees(prev => [...prev, found ? { nombre: found.nombre, codigo: found.codigo, unidad: found.unidad, localidad: found.localidad } : { nombre: val.toUpperCase(), codigo: null, unidad: null }]);
    setAddName('');
  }
  function removeAttendee(i: number) {
    setAttendees(prev => prev.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    if (!tema.trim() || !fecha || !hora) { alert('Completa al menos Tema, Fecha y Hora de inicio.'); return; }
    setSaving(true);
    const ok = await onSave(
      { capacitador: capacitadores.join(' / '), modulo, tema, fecha, hora, horaFin, localidad, lugar, modalidad, sala, estado, requisitos: requisitosList.join(' / '), observaciones },
      attendees
    );
    setSaving(false);
    if (ok) onClose();
  }

  async function handleDelete() {
    if (!confirm('¿Eliminar esta sesión y todos sus participantes del Registro?')) return;
    const ok = await onDeleteSession();
    if (ok) onClose();
  }

  const dis = readOnly;

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-card" role="dialog" aria-modal="true">
        <div className="modal-title">{isNew ? 'Nueva sesión de capacitación' : (readOnly ? 'Ver sesión' : 'Editar sesión')}</div>
        <div className="modal-sub">{isNew ? 'Se crearán filas nuevas en Registro, una por participante.' : `Los cambios se aplican a todas las filas de Registro de esta sesión (${attendees.length} participante(s)).`}</div>
        <div className="form-grid">
          <div className="form-field"><label>Módulo SAP</label>
            <FilterCombo label="Módulo SAP" hideLabel value={modulo} options={modulosDisponibles}
              onChange={setModulo} allLabel="— Sin módulo —" disabled={dis} />
          </div>
          <div className="form-field full">
            <label>Capacitador(es) ({capacitadores.length})</label>
            <div className="cap-editor">
              {capacitadores.length ? capacitadores.map((nom, i) => (
                <span key={i} className="cap-chip">
                  {nom}
                  {!readOnly && <button type="button" title="Quitar este capacitador" onClick={() => removeCapacitador(i)}>✕</button>}
                </span>
              )) : <span className="cap-empty">Sin capacitador asignado todavía.</span>}
            </div>
            {!readOnly && (
              <div className="cap-add-row">
                <input className="input" list="dl-capacitadores" placeholder="Nombre del capacitador…"
                  value={addCap} onChange={e => setAddCap(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCapacitador(); } }} />
                {/* Solo USUARIOS CLAVE (hoja USUARIOS): son los únicos que dictan
                    capacitaciones. Antes también se ofrecían los 1.303 empleados,
                    lo que hacía muy fácil poner por error a alguien que no es
                    capacitador. */}
                <datalist id="dl-capacitadores">
                  {capacitadoresDisponibles.map(u => (
                    <option key={u.nombre} value={u.nombre}>{u.modulo ? `Módulo ${u.modulo}` : ''}</option>
                  ))}
                </datalist>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => addCapacitador()}>+ Agregar</button>
              </div>
            )}
            {!readOnly && capacitadoresDisponibles.length > 0 && (
              <div className="cap-quick">
                <span className="cap-quick-label">Capacitadores frecuentes:</span>
                {capacitadoresDisponibles
                  .filter(u => !modulo || (u.modulo || '').toUpperCase().includes(modulo.toUpperCase()))
                  .filter(u => !capacitadores.some(x => x.toUpperCase() === u.nombre.toUpperCase()))
                  .slice(0, 10)
                  .map(u => (
                    <button key={u.nombre} type="button" className="cap-quick-btn"
                      onClick={() => addCapacitador(u.nombre)}
                      title={u.modulo ? `Módulo ${u.modulo}` : 'Agregar'}>
                      + {u.nombre}
                    </button>
                  ))}
              </div>
            )}
          </div>
          <div className="form-field full"><label>Tema de capacitación</label><input className="input" disabled={dis} value={tema} onChange={e => setTema(e.target.value)} /></div>
          <div className="form-field"><label>Fecha</label><input type="date" className="input" disabled={dis} value={fecha} onChange={e => setFecha(e.target.value)} /></div>
          <div className="form-field"><label>Modalidad del capacitador</label>
            <select className="input" disabled={dis} value={modalidad} onChange={e => setModalidad(e.target.value)}>
              <option value="PRESENCIAL">PRESENCIAL</option><option value="VIRTUAL">VIRTUAL</option><option value="POR CONFIRMAR">POR CONFIRMAR</option>
            </select>
            {/* La modalidad de la reunión no se elige a mano: sale de comparar la del
                capacitador con la de cada participante. Se muestra en vivo para que
                se vea el efecto al ir cambiando la lista. */}
            <div className={`mod-resultado ${modalidadReunion === 'HÍBRIDA' ? 'es-hibrida' : ''}`}>
              Modalidad de la reunión: <strong>{modalidadReunion}</strong>
              {modalidadReunion === 'HÍBRIDA' && <span className="mod-nota">hay presenciales y virtuales mezclados</span>}
            </div>
          </div>
          <div className="form-field"><label>Hora inicio</label><input type="time" className="input" disabled={dis} value={hora} onChange={e => setHora(e.target.value)} /></div>
          <div className="form-field"><label>Hora fin</label><input type="time" className="input" disabled={dis} value={horaFin} onChange={e => setHoraFin(e.target.value)} /></div>
          <div className="form-field"><label>Localidad</label>
            <FilterCombo label="Localidad" hideLabel value={localidad} options={localidadesDisponibles}
              onChange={setLocalidad} allLabel="— Sin localidad —" disabled={dis} />
          </div>
          <div className="form-field"><label>Lugar</label><input className="input" disabled={dis} value={lugar} onChange={e => setLugar(e.target.value)} /></div>
          <div className="form-field"><label>Sala específica</label>
            <select className="input" disabled={dis} value={sala} onChange={e => setSala(e.target.value)}>
              <option value="POR CONFIRMAR">POR CONFIRMAR</option>
              {salas.map(s => <option key={s.nombre} value={s.nombre}>{s.nombre}</option>)}
            </select>
          </div>
          <div className="form-field"><label>Estado</label>
            <select className="input" disabled={dis} value={estado} onChange={e => setEstado(e.target.value)}>
              <option value="PROGRAMADA">PROGRAMADA</option><option value="POR CONFIRMAR">POR CONFIRMAR</option>
            </select>
          </div>
          <div className="form-field full">
            <label>Requisitos / conocimiento previo ({requisitosList.length})</label>
            <div className="cap-editor">
              {requisitosList.length ? requisitosList.map((r, i) => (
                <span key={i} className="cap-chip">
                  {r}
                  {!readOnly && <button type="button" title="Quitar este requisito" onClick={() => removeRequisito(i)}>✕</button>}
                </span>
              )) : <span className="cap-empty">Sin requisitos indicados.</span>}
            </div>
            {!readOnly && (
              <div className="cap-add-row">
                {/* Elegir de la lista ya existente (evita escribir lo mismo de
                    formas distintas) o escribir uno nuevo si hace falta. */}
                <FilterCombo label="Requisitos" hideLabel value="" allLabel="+ Elegir de la lista…"
                  options={requisitosDisponibles.filter(r => !requisitosList.some(x => x.toUpperCase() === r.toUpperCase()))}
                  onChange={v => v && addRequisito(v)} />
                <input className="input" placeholder="…o escribir uno nuevo" value={addReq}
                  onChange={e => setAddReq(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRequisito(); } }} />
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => addRequisito()}>+ Agregar</button>
              </div>
            )}
          </div>
          <div className="form-field full"><label>Observaciones</label><input className="input" disabled={dis} value={observaciones} onChange={e => setObservaciones(e.target.value)} /></div>
          <div className="form-field full">
            <label>Participantes ({attendees.length})</label>
            <div className="attendees-editor">
              {attendees.length ? attendees.map((a, i) => (
                <span key={i} className="attendee-chip">{a.nombre} <span className="mono" style={{ color: 'var(--text-dim)' }}>#{a.codigo ?? '—'}</span> {!readOnly && <button type="button" onClick={() => removeAttendee(i)}>✕</button>}</span>
              )) : <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>Sin participantes todavía.</span>}
            </div>
            {!readOnly && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <input className="input" style={{ flex: 1 }} placeholder="Nombre del participante…" value={addName}
                  onChange={e => setAddName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addAttendee()} list="dl-part" />
                <datalist id="dl-part">{empleados.map(e => <option key={e.nombre} value={e.nombre} />)}</datalist>
                <button className="btn btn-ghost btn-sm" type="button" onClick={addAttendee}>+ Agregar</button>
              </div>
            )}
          </div>
        </div>
        <div className="modal-actions">
          <div>{!isNew && !readOnly && <button className="btn btn-danger" onClick={handleDelete}>Eliminar sesión</button>}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose}>{readOnly ? 'Cerrar' : 'Cancelar'}</button>
            {!readOnly && <button className="btn btn-amber" disabled={saving} onClick={handleSave}>{saving ? 'Guardando…' : (isNew ? 'Crear sesión' : 'Guardar cambios')}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}