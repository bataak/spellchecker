on run argv
	set duration to (item 1 of argv) as number
	set sample to read (POSIX file (item 2 of argv)) as «class utf8»
	set sampleLength to length of sample
	tell application "Microsoft Word"
		activate
		set doc to make new document
		set endTime to (current date) + duration
		set typed to 0
		repeat while (current date) < endTime
			set nextChar to character ((typed mod sampleLength) + 1) of sample
			if nextChar is linefeed then set nextChar to return
			insert text nextChar at end of text object of doc
			set typed to typed + 1
			delay 0.2
		end repeat
		close doc saving no
		quit
	end tell
	return "{\"typed\": " & typed & "}"
end run
