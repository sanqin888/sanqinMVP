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

function Resolve-OptionTextEn($option) {
  $en = Resolve-Text $option.nameEn
  if ($en) { return $en }
  $display = Resolve-Text $option.displayName
  if ($display) { return $display }
  return Resolve-Text $option.nameZh
}

function Resolve-OptionTextZh($option) {
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
      $columnGap = [single]8
      $headerHeight = [single]18

      $pairCode = Resolve-Text $current.pairCode
      $rawNameEn = Resolve-Text $current.nameEn
      $rawNameZh = Resolve-Text $current.nameZh
      $rawComponentNameEn = Resolve-Text $current.componentNameEn
      $rawComponentNameZh = Resolve-Text $current.componentNameZh
      $specialInstructions = Resolve-Text $current.specialInstructions

      $nameEn = if ($rawNameEn) { $rawNameEn } else { $rawNameZh }
      $nameZh = if ($rawNameZh) { $rawNameZh } else { $rawNameEn }
      $componentNameEn = if ($rawComponentNameEn) { $rawComponentNameEn } else { $rawComponentNameZh }
      $componentNameZh = if ($rawComponentNameZh) { $rawComponentNameZh } else { $rawComponentNameEn }

      $middleDot = [char]0x00B7
      $optionTextsEn = @()
      $optionTextsZh = @()
      foreach ($option in @($current.options)) {
        $textEn = Resolve-OptionTextEn $option
        $textZh = Resolve-OptionTextZh $option
        if ($textEn) { $optionTextsEn += $textEn }
        if ($textZh) { $optionTextsZh += $textZh }
      }
      if ($specialInstructions) {
        $notePrefixZh = ([char]0x5907).ToString() + ([char]0x6CE8).ToString()
        $optionTextsEn += "Note: $specialInstructions"
        $optionTextsZh += "${notePrefixZh}: $specialInstructions"
      }
      $detailEn = ($optionTextsEn -join " $middleDot ")
      $detailZh = ($optionTextsZh -join " $middleDot ")

      $innerWidth = [single][Math]::Max(40, $usableWidth - $left - $right)
      $columnWidth = [single][Math]::Max(32, $innerWidth - $columnGap)
      $englishWidth = [single][Math]::Floor($columnWidth * 0.60)
      $chineseWidth = [single]($columnWidth - $englishWidth)
      $englishX = $left
      $chineseX = [single]($left + $englishWidth + $columnGap)
      $contentTop = [single]($top + $headerHeight)
      $contentBottom = [single]($usableHeight - $bottom)

      $pairFont = New-Object System.Drawing.Font($FontName, 14, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Point)
      $nameEnFont = New-Object System.Drawing.Font($FontName, 9, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Point)
      $nameZhFont = New-Object System.Drawing.Font($FontName, 10.5, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Point)
      $componentEnFont = New-Object System.Drawing.Font($FontName, 7, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Point)
      $componentZhFont = New-Object System.Drawing.Font($FontName, 8, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Point)
      $detailEnFont = New-Object System.Drawing.Font($FontName, 6.5, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Point)
      $detailZhFont = New-Object System.Drawing.Font($FontName, 7.5, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Point)
      $orderFont = New-Object System.Drawing.Font($FontName, 6.5, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Point)
      $brush = [System.Drawing.Brushes]::Black

      $singleLineFormat = New-Object System.Drawing.StringFormat
      $singleLineFormat.Trimming = [System.Drawing.StringTrimming]::EllipsisCharacter
      $singleLineFormat.FormatFlags = [System.Drawing.StringFormatFlags]::NoWrap

      $wrapFormat = New-Object System.Drawing.StringFormat
      $wrapFormat.Trimming = [System.Drawing.StringTrimming]::EllipsisCharacter
      $wrapFormat.FormatFlags = [System.Drawing.StringFormatFlags]::LineLimit

      $orderFormat = New-Object System.Drawing.StringFormat
      $orderFormat.Trimming = [System.Drawing.StringTrimming]::EllipsisCharacter
      $orderFormat.FormatFlags = [System.Drawing.StringFormatFlags]::NoWrap
      $orderFormat.Alignment = [System.Drawing.StringAlignment]::Far

      try {
        if ($pairCode) {
          $pairRect = New-Object System.Drawing.RectangleF($left, $top, 42, $headerHeight)
          $graphics.DrawString($pairCode, $pairFont, $brush, $pairRect, $singleLineFormat)
        }
        if ($orderNumber) {
          $orderX = [single]($left + 44)
          $orderY = [single]($top + 1)
          $orderWidth = [single][Math]::Max(20, $innerWidth - 44)
          $orderHeight = [single][Math]::Max(8, $headerHeight - 2)
          $orderRect = New-Object System.Drawing.RectangleF($orderX, $orderY, $orderWidth, $orderHeight)
          $graphics.DrawString("#$orderNumber", $orderFont, $brush, $orderRect, $orderFormat)
        }

        $englishCursor = $contentTop
        if ($nameEn) {
          $nameEnHeight = [single]30
          $graphics.DrawString($nameEn, $nameEnFont, $brush, (New-Object System.Drawing.RectangleF($englishX, $englishCursor, $englishWidth, $nameEnHeight)), $wrapFormat)
          $englishCursor += $nameEnHeight + 1
        }
        if ($componentNameEn) {
          $componentEnHeight = [single]16
          $graphics.DrawString($componentNameEn, $componentEnFont, $brush, (New-Object System.Drawing.RectangleF($englishX, $englishCursor, $englishWidth, $componentEnHeight)), $wrapFormat)
          $englishCursor += $componentEnHeight + 1
        }
        if ($detailEn -and $englishCursor -lt $contentBottom) {
          $detailEnHeight = [single]($contentBottom - $englishCursor)
          $graphics.DrawString($detailEn, $detailEnFont, $brush, (New-Object System.Drawing.RectangleF($englishX, $englishCursor, $englishWidth, $detailEnHeight)), $wrapFormat)
        }

        $chineseCursor = $contentTop
        if ($nameZh) {
          $nameZhHeight = [single]29
          $graphics.DrawString($nameZh, $nameZhFont, $brush, (New-Object System.Drawing.RectangleF($chineseX, $chineseCursor, $chineseWidth, $nameZhHeight)), $wrapFormat)
          $chineseCursor += $nameZhHeight + 1
        }
        if ($componentNameZh) {
          $componentZhHeight = [single]16
          $graphics.DrawString($componentNameZh, $componentZhFont, $brush, (New-Object System.Drawing.RectangleF($chineseX, $chineseCursor, $chineseWidth, $componentZhHeight)), $wrapFormat)
          $chineseCursor += $componentZhHeight + 1
        }
        if ($detailZh -and $chineseCursor -lt $contentBottom) {
          $detailZhHeight = [single]($contentBottom - $chineseCursor)
          $graphics.DrawString($detailZh, $detailZhFont, $brush, (New-Object System.Drawing.RectangleF($chineseX, $chineseCursor, $chineseWidth, $detailZhHeight)), $wrapFormat)
        }
      } finally {
        $singleLineFormat.Dispose()
        $wrapFormat.Dispose()
        $orderFormat.Dispose()
        $pairFont.Dispose()
        $nameEnFont.Dispose()
        $nameZhFont.Dispose()
        $componentEnFont.Dispose()
        $componentZhFont.Dispose()
        $detailEnFont.Dispose()
        $detailZhFont.Dispose()
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
