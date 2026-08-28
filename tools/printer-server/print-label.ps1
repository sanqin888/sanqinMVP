param(
  [Parameter(Mandatory = $true)][string]$PrinterName,
  [Parameter(Mandatory = $true)][string]$PayloadPath,
  [string]$FontName = "Microsoft YaHei UI"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

if (-not (Test-Path -LiteralPath $PayloadPath)) {
  throw "LABEL_PAYLOAD_NOT_FOUND"
}

$payload = Get-Content -LiteralPath $PayloadPath -Raw -Encoding UTF8 | ConvertFrom-Json
$labels = @($payload.labels)
if ($labels.Count -eq 0) {
  exit 0
}

function MmToHundredthsInch([double]$mm) {
  return [int][Math]::Round(($mm / 25.4) * 100.0)
}

function Resolve-Text($value, [string]$fallback = "") {
  if ($null -eq $value) { return $fallback }
  $text = [string]$value
  if ([string]::IsNullOrWhiteSpace($text)) { return $fallback }
  return $text.Trim()
}

function Resolve-OptionText($option) {
  $zh = Resolve-Text $option.nameZh
  if ($zh) { return $zh }
  $display = Resolve-Text $option.displayName
  if ($display) { return $display }
  return Resolve-Text $option.nameEn
}

$widthMm = if ($payload.labelWidthMm) { [double]$payload.labelWidthMm } else { 70.0 }
$heightMm = if ($payload.labelHeightMm) { [double]$payload.labelHeightMm } else { 30.0 }
$paperWidth = MmToHundredthsInch $widthMm
$paperHeight = MmToHundredthsInch $heightMm
$orderNumber = Resolve-Text $payload.orderNumber

foreach ($label in $labels) {
  $copies = 1
  if ($label.copies -and [int]$label.copies -gt 1) {
    $copies = [int]$label.copies
  }

  for ($copyIndex = 0; $copyIndex -lt $copies; $copyIndex += 1) {
    $document = New-Object System.Drawing.Printing.PrintDocument
    $document.PrinterSettings.PrinterName = $PrinterName
    if (-not $document.PrinterSettings.IsValid) {
      $document.Dispose()
      throw "POS_LABEL_PRINTER_INVALID: $PrinterName"
    }

    $document.DocumentName = if ($orderNumber) { "SanQ Label $orderNumber" } else { "SanQ Label" }
    $document.PrintController = New-Object System.Drawing.Printing.StandardPrintController
    $document.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
    $document.DefaultPageSettings.PaperSize = New-Object System.Drawing.Printing.PaperSize("SanQ 70x30", $paperWidth, $paperHeight)
    $document.DefaultPageSettings.Landscape = $false
    $document.OriginAtMargins = $false

    $current = $label
    $handler = [System.Drawing.Printing.PrintPageEventHandler]{
      param($sender, $eventArgs)

      $graphics = $eventArgs.Graphics
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

      $usableWidth = [single]$eventArgs.PageBounds.Width
      $usableHeight = [single]$eventArgs.PageBounds.Height
      $left = [single]5
      $right = [single]5
      $top = [single]4
      $bottom = [single]4

      $pairCode = Resolve-Text $current.pairCode
      $nameZh = Resolve-Text $current.nameZh
      $nameEn = Resolve-Text $current.nameEn
      $componentNameZh = Resolve-Text $current.componentNameZh
      $componentNameEn = Resolve-Text $current.componentNameEn
      $specialInstructions = Resolve-Text $current.specialInstructions

      $pairFont = New-Object System.Drawing.Font($FontName, 20, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Point)
      $nameZhFont = New-Object System.Drawing.Font($FontName, 13, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Point)
      $nameEnFont = New-Object System.Drawing.Font($FontName, 7.5, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Point)
      $componentFont = New-Object System.Drawing.Font($FontName, 10.5, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Point)
      $detailFont = New-Object System.Drawing.Font($FontName, 8, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Point)
      $orderFont = New-Object System.Drawing.Font($FontName, 6.5, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Point)
      $brush = [System.Drawing.Brushes]::Black

      $ellipsis = New-Object System.Drawing.StringFormat
      $ellipsis.Trimming = [System.Drawing.StringTrimming]::EllipsisCharacter
      $ellipsis.FormatFlags = [System.Drawing.StringFormatFlags]::NoWrap

      try {
        $nameLeft = $left
        if ($pairCode) {
          $pairRect = New-Object System.Drawing.RectangleF($left, $top, 34, 30)
          $graphics.DrawString($pairCode, $pairFont, $brush, $pairRect, $ellipsis)
          $nameLeft = 40
        }

        $nameWidth = [Math]::Max(20, $usableWidth - $nameLeft - $right)
        if ($nameZh) {
          $graphics.DrawString($nameZh, $nameZhFont, $brush, (New-Object System.Drawing.RectangleF($nameLeft, $top, $nameWidth, 24)), $ellipsis)
        }
        if ($nameEn) {
          $graphics.DrawString($nameEn, $nameEnFont, $brush, (New-Object System.Drawing.RectangleF($nameLeft, 26, $nameWidth, 14)), $ellipsis)
        }

        $componentText = ""
        $middleDot = [char]0x00B7
        if ($componentNameZh -and $componentNameEn) {
          $componentText = "$componentNameZh $middleDot $componentNameEn"
        } elseif ($componentNameZh) {
          $componentText = $componentNameZh
        } elseif ($componentNameEn) {
          $componentText = $componentNameEn
        }
        if ($componentText) {
          $graphics.DrawString($componentText, $componentFont, $brush, (New-Object System.Drawing.RectangleF($left, 43, $usableWidth - $left - $right, 20)), $ellipsis)
        }

        $optionTexts = @()
        foreach ($option in @($current.options)) {
          $text = Resolve-OptionText $option
          if ($text) { $optionTexts += $text }
        }
        if ($specialInstructions) {
          $notePrefix = ([char]0x5907).ToString() + ([char]0x6CE8).ToString()
          $optionTexts += "${notePrefix}: $specialInstructions"
        }
        $detail = ($optionTexts -join " · ")
        if ($detail) {
          $detailTop = if ($componentText) { 66 } else { 43 }
          $detailFormat = New-Object System.Drawing.StringFormat
          try {
            $detailFormat.Trimming = [System.Drawing.StringTrimming]::EllipsisCharacter
            $graphics.DrawString($detail, $detailFont, $brush, (New-Object System.Drawing.RectangleF($left, $detailTop, $usableWidth - $left - $right, [Math]::Max(18, $usableHeight - $detailTop - 18))), $detailFormat)
          } finally {
            $detailFormat.Dispose()
          }
        }

        if ($orderNumber) {
          $orderFormat = New-Object System.Drawing.StringFormat
          try {
            $orderFormat.Alignment = [System.Drawing.StringAlignment]::Far
            $graphics.DrawString("#$orderNumber", $orderFont, $brush, (New-Object System.Drawing.RectangleF($left, $usableHeight - 16 - $bottom, $usableWidth - $left - $right, 14)), $orderFormat)
          } finally {
            $orderFormat.Dispose()
          }
        }
      } finally {
        $ellipsis.Dispose()
        $pairFont.Dispose()
        $nameZhFont.Dispose()
        $nameEnFont.Dispose()
        $componentFont.Dispose()
        $detailFont.Dispose()
        $orderFont.Dispose()
      }

      $eventArgs.HasMorePages = $false
    }

    $document.add_PrintPage($handler)
    try {
      $document.Print()
    } finally {
      $document.remove_PrintPage($handler)
      $document.Dispose()
    }
  }
}
