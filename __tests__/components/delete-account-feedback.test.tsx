import { afterEach, it, expect, vi } from "vitest"
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import { DeleteAccountSection } from "@/components/profile/settings/delete-account-section"
afterEach(cleanup)
it("keeps the confirmation open with an actionable error after deletion fails", async () => {
  const remove = vi.fn().mockRejectedValue(new Error("잠시 후 다시 시도해주세요."))
  render(<DeleteAccountSection onDelete={remove} />)
  fireEvent.click(screen.getByRole("button", { name: "계정 삭제" }))
  fireEvent.change(screen.getByPlaceholderText("계정삭제"), { target: { value: "계정삭제" } })
  fireEvent.click(screen.getByRole("button", { name: "삭제" }))
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("잠시 후 다시 시도해주세요.")
  )
  expect(screen.getByRole("alertdialog")).toBeVisible()
  expect(remove).toHaveBeenCalledTimes(1)
})
