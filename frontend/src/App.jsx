import { useCallback, useEffect, useState } from 'react'
import './App.css'

const emptyProject = { project_name: '', target: '', achievement_percent: '' }
const emptyDetail = { category: '', achievement: '' }
const REFRESH_STORAGE_KEY = 'dataflow-dashboard-refresh'
const REFRESH_OPTIONS = [
  { label: '30 seconds', value: 30 },
  { label: '1 minute', value: 60 },
  { label: '5 minutes', value: 300 },
  { label: '10 minutes', value: 600 },
  { label: '15 minutes', value: 900 },
  { label: '30 minutes', value: 1800 },
  { label: 'Manual', value: 'manual' },
]

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'The request could not be completed.')
  return body
}

function App() {
  const [route, setRoute] = useState(window.location.pathname)
  useEffect(() => {
    const handleNavigation = () => setRoute(window.location.pathname)
    window.addEventListener('popstate', handleNavigation)
    return () => window.removeEventListener('popstate', handleNavigation)
  }, [])
  const navigate = (path) => { window.history.pushState({}, '', path); setRoute(path) }
  if (route.startsWith('/admin')) return <AdminPage navigate={navigate} />
  const projectMatch = route.match(/^\/projects\/(\d+)$/)
  if (projectMatch) return <ProjectDetailsPage projectId={projectMatch[1]} navigate={navigate} />
  return <DashboardPage navigate={navigate} />
}

function SiteHeader({ navigate, currentPage }) {
  return <header className="topbar"><button className="brand" onClick={() => navigate('/')}>Dataflow<span>Board</span></button><nav className="site-nav" aria-label="Primary navigation"><button className={currentPage === 'dashboard' ? 'nav-link active' : 'nav-link'} onClick={() => navigate('/')}>Dashboard</button><button className={currentPage === 'admin' ? 'nav-link active' : 'nav-link'} onClick={() => navigate('/admin')}>Admin</button></nav></header>
}

function DashboardPage({ navigate }) {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)
  const [refreshPreference, setRefreshPreference] = useState(() => {
    const storedValue = window.localStorage.getItem(REFRESH_STORAGE_KEY)
    return REFRESH_OPTIONS.some((option) => String(option.value) === storedValue) ? storedValue : '300'
  })
  const [nextRefreshAt, setNextRefreshAt] = useState(null)
  const [countdownSeconds, setCountdownSeconds] = useState(null)
  const refreshOption = REFRESH_OPTIONS.find((option) => String(option.value) === refreshPreference) || REFRESH_OPTIONS[2]
  const refreshMs = refreshOption.value === 'manual' ? null : Number(refreshOption.value) * 1000

  const loadProjects = useCallback(async ({ initial = false } = {}) => {
    if (initial) setLoading(true)
    else setRefreshing(true)
    setError('')
    try {
      setProjects(await apiRequest('/api/projects'))
      setLastUpdated(new Date())
      setNextRefreshAt(refreshMs ? Date.now() + refreshMs : null)
    } catch {
      setError('Unable to load dashboard data.')
    } finally {
      if (initial) setLoading(false)
      else setRefreshing(false)
    }
  }, [refreshMs])

  useEffect(() => {
    loadProjects({ initial: true })
  }, [loadProjects])

  useEffect(() => {
    if (!refreshMs) return undefined
    const timerId = window.setInterval(() => loadProjects(), refreshMs)
    return () => window.clearInterval(timerId)
  }, [loadProjects, refreshMs])

  useEffect(() => {
    if (!nextRefreshAt || !refreshMs) {
      setCountdownSeconds(null)
      return undefined
    }
    const updateCountdown = () => setCountdownSeconds(Math.max(0, Math.ceil((nextRefreshAt - Date.now()) / 1000)))
    updateCountdown()
    const timerId = window.setInterval(updateCountdown, 1000)
    return () => window.clearInterval(timerId)
  }, [nextRefreshAt, refreshMs])

  const changeRefreshPreference = (event) => {
    const value = event.target.value
    setRefreshPreference(value)
    window.localStorage.setItem(REFRESH_STORAGE_KEY, value)
  }

  const formatCountdown = () => {
    if (!refreshMs) return 'Manual'
    if (countdownSeconds === null) return 'Pending'
    const minutes = Math.floor((countdownSeconds || 0) / 60)
    const seconds = (countdownSeconds || 0) % 60
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`
  }

  return <div className="dashboard-shell"><SiteHeader navigate={navigate} currentPage="dashboard" /><main className="dashboard-content"><div className="dashboard-heading"><div><p className="eyebrow">PORTFOLIO OVERVIEW</p><h1>Project dashboard</h1><p className="dashboard-intro">A clear view of progress across every active initiative.</p></div>{lastUpdated && <p className="last-updated">Last updated: {lastUpdated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>}</div><div className="refresh-toolbar"><label className="refresh-select">Refresh:<select value={refreshPreference} onChange={changeRefreshPreference}>{REFRESH_OPTIONS.map((option) => <option key={option.label} value={option.value}>{option.label}</option>)}</select></label><span className="next-refresh">Next refresh: {formatCountdown()}</span><button className="button button-quiet refresh-button" onClick={() => loadProjects()} disabled={refreshing}>{refreshing ? 'Refreshing...' : '↻ Refresh'}</button></div>{error && projects.length > 0 && <div className="notice notice-error dashboard-notice" role="alert">{error} Existing project data is still shown.</div>}{loading ? <p className="dashboard-state">Loading dashboard...</p> : error && projects.length === 0 ? <div className="dashboard-state"><p>Unable to load dashboard data.</p><button className="button button-primary" onClick={() => loadProjects({ initial: true })}>Retry</button></div> : projects.length === 0 ? <div className="dashboard-state"><p>No projects available.</p><button className="button button-primary" onClick={() => navigate('/admin')}>Open Admin</button></div> : <div className="project-grid">{projects.map((project) => <ProjectCard key={project.id} project={project} onClick={() => navigate(`/projects/${project.id}`)} />)}</div>}</main></div>
}

function ProjectCard({ project, onClick }) {
  return <button className="project-card" onClick={onClick}><div className="card-topline"><span className="card-kicker">PROJECT</span><span className="card-arrow" aria-hidden="true">↗</span></div><h2>{project.project_name}</h2><div className="card-target"><span>Target</span><strong>{project.target}</strong></div><div className="card-progress-label"><span>Achievement</span><strong>{project.achievement_percent}%</strong></div><div className="card-progress"><span style={{ width: `${project.achievement_percent}%` }} /></div><span className="card-link">View project details</span></button>
}

function ProjectDetailsPage({ projectId, navigate }) {
  const [project, setProject] = useState(null)
  const [details, setDetails] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const loadDetails = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const [projects, projectDetails] = await Promise.all([apiRequest('/api/projects'), apiRequest(`/api/projects/${projectId}/details`)] )
      const matchingProject = projects.find((item) => String(item.id) === projectId)
      if (!matchingProject) throw new Error('Project not found.')
      setProject(matchingProject)
      setDetails(projectDetails)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { loadDetails() }, [loadDetails])

  return <div className="dashboard-shell"><SiteHeader navigate={navigate} currentPage="dashboard" /><main className="details-content"><button className="back-link" onClick={() => navigate('/')}>← Back to Dashboard</button>{loading ? <p className="dashboard-state">Loading project details...</p> : error ? <div className="dashboard-state"><p>Unable to load project details.</p><button className="button button-primary" onClick={loadDetails}>Retry</button></div> : <><div className="details-heading"><p className="eyebrow">PROJECT DETAILS</p><h1>{project.project_name}</h1><div className="details-summary"><span>Target <strong>{project.target}</strong></span><span>Achievement <strong>{project.achievement_percent}%</strong></span></div><div className="card-progress"><span style={{ width: `${project.achievement_percent}%` }} /></div></div><section className="details-panel"><div className="details-panel-heading"><div><h2>Progress by category</h2><p>Detail records from the selected project.</p></div></div>{details.length === 0 ? <p className="dashboard-state">No detail records available.</p> : <div className="detail-list">{details.map((detail) => <div className="detail-row" key={detail.id}><div><strong>{detail.category}</strong><span>Project detail</span></div><div className="detail-achievement"><strong>{detail.achievement}%</strong><div className="card-progress"><span style={{ width: `${detail.achievement}%` }} /></div></div></div>)}</div>}</section></>}</main></div>
}

function AdminPage({ navigate }) {
  const [projects, setProjects] = useState([])
  const [selectedProject, setSelectedProject] = useState(null)
  const [details, setDetails] = useState([])
  const [projectForm, setProjectForm] = useState(emptyProject)
  const [detailForm, setDetailForm] = useState(emptyDetail)
  const [editingProjectId, setEditingProjectId] = useState(null)
  const [editingDetailId, setEditingDetailId] = useState(null)
  const [showProjectForm, setShowProjectForm] = useState(false)
  const [showDetailForm, setShowDetailForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const loadProjects = async () => {
    setLoading(true)
    try { setProjects(await apiRequest('/api/projects')); setError('') } catch (requestError) { setError(requestError.message) } finally { setLoading(false) }
  }
  const loadDetails = async (project) => {
    setSelectedProject(project); setDetailsLoading(true); setError('')
    try { setDetails(await apiRequest(`/api/projects/${project.id}/details`)) } catch (requestError) { setError(requestError.message) } finally { setDetailsLoading(false) }
  }
  useEffect(() => { loadProjects() }, [])
  const showSuccess = (message) => { setSuccess(message); setError('') }

  const submitProject = async (event) => {
    event.preventDefault()
    const wasEditing = editingProjectId
    try {
      await apiRequest(wasEditing ? `/api/projects/${wasEditing}` : '/api/projects', { method: wasEditing ? 'PUT' : 'POST', body: JSON.stringify({ ...projectForm, achievement_percent: Number(projectForm.achievement_percent) }) })
      await loadProjects(); setProjectForm(emptyProject); setEditingProjectId(null); setShowProjectForm(false); showSuccess(wasEditing ? 'Project updated successfully.' : 'Project created successfully.')
    } catch (requestError) { setError(requestError.message) }
  }
  const submitDetail = async (event) => {
    event.preventDefault()
    const wasEditing = editingDetailId
    try {
      const path = `/api/projects/${selectedProject.id}/details${wasEditing ? `/${wasEditing}` : ''}`
      await apiRequest(path, { method: wasEditing ? 'PUT' : 'POST', body: JSON.stringify({ project_name: selectedProject.project_name, ...detailForm, achievement: Number(detailForm.achievement) }) })
      await loadDetails(selectedProject); setDetailForm(emptyDetail); setEditingDetailId(null); setShowDetailForm(false); showSuccess(wasEditing ? 'Detail updated successfully.' : 'Detail added successfully.')
    } catch (requestError) { setError(requestError.message) }
  }
  const editProject = (project) => { setProjectForm({ project_name: project.project_name, target: project.target, achievement_percent: project.achievement_percent }); setEditingProjectId(project.id); setShowProjectForm(true); setSuccess('') }
  const deleteProject = async (project) => {
    if (!window.confirm('Are you sure you want to delete this project? Its project details will also be deleted.')) return
    try { await apiRequest(`/api/projects/${project.id}`, { method: 'DELETE' }); if (selectedProject?.id === project.id) { setSelectedProject(null); setDetails([]) }; await loadProjects(); showSuccess('Project deleted successfully.') } catch (requestError) { setError(requestError.message) }
  }
  const editDetail = (detail) => { setDetailForm({ category: detail.category, achievement: detail.achievement }); setEditingDetailId(detail.id); setShowDetailForm(true); setSuccess('') }
  const deleteDetail = async (detail) => {
    if (!window.confirm('Are you sure you want to delete this detail?')) return
    try { await apiRequest(`/api/projects/${selectedProject.id}/details/${detail.id}`, { method: 'DELETE' }); await loadDetails(selectedProject); showSuccess('Detail deleted successfully.') } catch (requestError) { setError(requestError.message) }
  }
  const resetProjectForm = () => { setProjectForm(emptyProject); setEditingProjectId(null); setShowProjectForm(false) }
  const resetDetailForm = () => { setDetailForm(emptyDetail); setEditingDetailId(null); setShowDetailForm(false) }

  return <div className="admin-shell">
    <SiteHeader navigate={navigate} currentPage="admin" />
    <main className="admin-content">
      <div className="page-heading"><div><p className="eyebrow">ADMINISTRATION</p><h1>{selectedProject ? 'Project details' : 'Projects'}</h1></div>{selectedProject && <button className="button button-quiet" onClick={() => { setSelectedProject(null); setSuccess('') }}>← Back to projects</button>}</div>
      {error && <div className="notice notice-error" role="alert">{error}</div>}{success && <div className="notice notice-success" role="status">{success}</div>}
      {!selectedProject ? <section className="panel"><div className="panel-heading"><div><h2>Project management</h2><p>Track the initiatives that matter.</p></div><button className="button button-primary" onClick={() => { resetProjectForm(); setShowProjectForm(true) }}>＋ Add Project</button></div>{showProjectForm && <ProjectForm form={projectForm} setForm={setProjectForm} editing={editingProjectId} onSubmit={submitProject} onCancel={resetProjectForm} />}{loading ? <p className="empty-state">Loading projects...</p> : projects.length === 0 ? <p className="empty-state">No projects yet. Add the first one to get started.</p> : <ProjectTable projects={projects} onEdit={editProject} onDelete={deleteProject} onDetails={loadDetails} />}</section> : <section className="panel"><div className="project-banner"><div><p className="eyebrow">SELECTED PROJECT</p><h2>{selectedProject.project_name}</h2><p>{selectedProject.target} target · {selectedProject.achievement_percent}% complete</p></div><button className="button button-primary" onClick={() => { resetDetailForm(); setShowDetailForm(true) }}>＋ Add Detail</button></div>{showDetailForm && <DetailForm form={detailForm} setForm={setDetailForm} editing={editingDetailId} onSubmit={submitDetail} onCancel={resetDetailForm} />}{detailsLoading ? <p className="empty-state">Loading details...</p> : details.length === 0 ? <p className="empty-state">No detail records yet.</p> : <DetailTable details={details} onEdit={editDetail} onDelete={deleteDetail} />}</section>}
    </main>
  </div>
}

function ProjectForm({ form, setForm, editing, onSubmit, onCancel }) {
  return <form className="form-grid" onSubmit={onSubmit}><label>Project Name<input required value={form.project_name} onChange={(event) => setForm({ ...form, project_name: event.target.value })} /></label><label>Target<input required value={form.target} onChange={(event) => setForm({ ...form, target: event.target.value })} /></label><label>Achievement %<input required type="number" min="0" max="100" step="any" value={form.achievement_percent} onChange={(event) => setForm({ ...form, achievement_percent: event.target.value })} /></label><div className="form-actions"><button className="button button-primary" type="submit">{editing ? 'Save Changes' : 'Create Project'}</button><button className="button button-quiet" type="button" onClick={onCancel}>Cancel</button></div></form>
}
function DetailForm({ form, setForm, editing, onSubmit, onCancel }) {
  return <form className="form-grid detail-form" onSubmit={onSubmit}><label>Category<input required value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} /></label><label>Achievement<input required type="number" min="0" max="100" step="any" value={form.achievement} onChange={(event) => setForm({ ...form, achievement: event.target.value })} /></label><div className="form-actions"><button className="button button-primary" type="submit">{editing ? 'Save Changes' : 'Add Detail'}</button><button className="button button-quiet" type="button" onClick={onCancel}>Cancel</button></div></form>
}
function ProjectTable({ projects, onEdit, onDelete, onDetails }) {
  return <div className="table-wrap"><table><thead><tr><th>Project name</th><th>Target</th><th>Achievement</th><th className="actions-heading">Actions</th></tr></thead><tbody>{projects.map((project) => <tr key={project.id}><td data-label="Project name"><strong>{project.project_name}</strong></td><td data-label="Target">{project.target}</td><td data-label="Achievement"><span className="progress-value">{project.achievement_percent}%</span><div className="progress-track"><span style={{ width: `${project.achievement_percent}%` }} /></div></td><td data-label="Actions" className="actions"><button onClick={() => onEdit(project)}>Edit</button><button onClick={() => onDetails(project)}>Manage Details</button><button className="danger-text" onClick={() => onDelete(project)}>Delete</button></td></tr>)}</tbody></table></div>
}
function DetailTable({ details, onEdit, onDelete }) {
  return <div className="table-wrap"><table><thead><tr><th>Category</th><th>Achievement</th><th className="actions-heading">Actions</th></tr></thead><tbody>{details.map((detail) => <tr key={detail.id}><td data-label="Category"><strong>{detail.category}</strong></td><td data-label="Achievement"><span className="progress-value">{detail.achievement}%</span><div className="progress-track"><span style={{ width: `${detail.achievement}%` }} /></div></td><td data-label="Actions" className="actions"><button onClick={() => onEdit(detail)}>Edit</button><button className="danger-text" onClick={() => onDelete(detail)}>Delete</button></td></tr>)}</tbody></table></div>
}

export default App
