export default function PlaceholderPage({ title, message }) {
  return (
    <section className="admin-panel">
      <div className="admin-placeholder">
        <h3>{title}</h3>
        <p>{message || '该栏目已完成框架接入，后续可补充真实业务接口与交互。'}</p>
      </div>
    </section>
  )
}
