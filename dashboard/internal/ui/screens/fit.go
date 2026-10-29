package screens

import (
	"strings"

	"github.com/charmbracelet/lipgloss"
)

// oneLine forces a chrome strip into the single row the height budget counted.
// lipgloss Width wraps; MaxHeight then keeps the first of those lines.
func oneLine(width int, style lipgloss.Style, content string) string {
	if width < 1 {
		width = 1
	}
	return style.Width(width).MaxHeight(1).Render(content)
}

// fitPlain shortens content to budget cells. The start says what failed and
// the end carries the filename and the reason, so a long path is what gives.
func fitPlain(budget int, content string) string {
	if budget < 1 {
		return ""
	}
	if lipgloss.Width(content) <= budget {
		return content
	}
	runes := []rune(content)
	if len(runes) <= budget {
		return truncateRunes(content, budget)
	}
	const ellipsis = "..."
	if budget <= len(ellipsis) {
		return string(runes[:budget])
	}
	tail := budget / 3
	if tail < 24 {
		tail = 24
	}
	if tail > budget-len(ellipsis)-8 {
		tail = budget - len(ellipsis) - 8
	}
	if tail < 1 {
		return string(runes[len(runes)-budget:])
	}
	head := budget - tail - len(ellipsis)
	if head < 1 {
		return string(runes[len(runes)-budget:])
	}
	return string(runes[:head]) + ellipsis + string(runes[len(runes)-tail:])
}

// fitTitleBar places info on the right when it fits, and drops it when the
// title alone is what the row can hold.
func fitTitleBar(width int, title, info string) string {
	inner := width - 4
	if inner < 1 {
		inner = 1
	}
	tw := lipgloss.Width(title)
	iw := lipgloss.Width(info)
	if iw > 0 && tw+1+iw <= inner {
		return title + strings.Repeat(" ", inner-tw-iw) + info
	}
	return title
}

type helpPiece struct {
	text string
	pin  bool
}

// joinHelp keeps pinned pieces (the way out of the screen) and as many of the
// others as fit, then the brand only when its plain width still has room.
func joinHelp(budget int, pieces []helpPiece, brandPlain, brandRendered string) string {
	if budget < 1 {
		budget = 1
	}
	pinW := 0
	var pins, rest []helpPiece
	for _, p := range pieces {
		if p.pin {
			pins = append(pins, p)
			pinW += lipgloss.Width(p.text)
		} else {
			rest = append(rest, p)
		}
	}
	pinsFit := pinW <= budget
	var b strings.Builder
	used := 0
	reserve := 0
	if pinsFit {
		reserve = pinW
	}
	for _, p := range rest {
		w := lipgloss.Width(p.text)
		if used+w+reserve <= budget {
			b.WriteString(p.text)
			used += w
		}
	}
	if pinsFit {
		for _, p := range pins {
			b.WriteString(p.text)
			used += lipgloss.Width(p.text)
		}
	}
	if brandRendered != "" {
		bw := lipgloss.Width(brandPlain)
		if used+1+bw <= budget {
			b.WriteString(strings.Repeat(" ", budget-used-bw))
			b.WriteString(brandRendered)
		}
	}
	return b.String()
}
