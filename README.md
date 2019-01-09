## diagnoss

Metrics Tracking for Open Source Software


### CLI

Specifying repositories to report on:
- `-r` - list of particular repos (multiple repos, separate by commas)
- `-o` - pull from orgs (multiple orgs, separate by commas)
- `-p` - pull from [packweb](https://github.com/appium/packweb) configuration

Date ranges (for specifying collaborator, pull request, and download statistics):
- `-t1` - start date
- `-t2` - end date

Information to report (defaults to GitHub basic repository stats):
- `-n` - basic contributor statistics
- `-c` - full collaborator statistics for specific contributors (multiple contributors, separate by commas)
- `-issuesByDay` - issues since the day specified
- `-pulls` - pull requests over time
- `-downloads` - downloads over time
