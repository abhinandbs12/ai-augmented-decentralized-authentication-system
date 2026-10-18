/** Previous/next controls for a paged API response; hidden when everything fits on one page. */
export function Pagination({ page, onChange }) {
  if (!page || page.totalPages <= 1) return null;
  return (
    <nav className="pagination" aria-label="Pagination">
      <button className="button" disabled={page.page === 0} onClick={() => onChange(page.page - 1)}>
        Previous
      </button>
      <span className="muted">
        Page {page.page + 1} of {page.totalPages} ({page.totalElements} total)
      </span>
      <button className="button" disabled={page.page + 1 >= page.totalPages} onClick={() => onChange(page.page + 1)}>
        Next
      </button>
    </nav>
  );
}
